// @desc    Update a user
// @route   PATCH /api/users/:id
// @access  Private/Admin
export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    // Ensure the request body is not empty before proceeding
    if (!updateData || Object.keys(updateData).length === 0 || 
        Object.values(updateData).every(v => v === '' || v === null || v === undefined)) {
      return res.status(400).json({
        status: 'fail',
        message: 'No valid data provided for update.',
      });
    }

    // Ensure request has a valid user object (from protect middleware)
    if (!req.user?.id) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required',
      });
    }

    // Find the user and include the password hash for verification
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        passwordHash: true,
        role: true,
        email: true,
        phone: true,
        username: true,
        version: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found',
      });
    }

    // Check if the user is updating their own profile or is an admin
    const actorId = req.user.id.toString();
    if (user.id.toString() !== actorId && req.user.role !== 'admin') {
      return res.status(403).json({
        status: 'error',
        message: 'Not authorized to update this user',
      });
    }

    // Prevent role modification by non-admins
    if (updateData.role && updateData.role !== user.role && req.user.role !== 'admin') {
      return res.status(403).json({
        status: 'error',
        message: 'Not authorized to modify user role',
      });
    }

    // Handle password update with enhanced validation
    if (updateData.password) {
      if (!updateData.currentPassword) {
        return res.status(400).json({
          status: 'error',
          message: 'Current password is required to update password',
        });
      }

      const isPasswordValid = user.passwordHash
        ? await bcrypt.compare(updateData.currentPassword, user.passwordHash)
        : false;
      if (!isPasswordValid) {
        return res.status(400).json({
          status: 'error',
          message: 'Current password is incorrect',
        });
      }

      const isSamePassword = user.passwordHash
        ? await bcrypt.compare(updateData.password, user.passwordHash)
        : false;
      if (isSamePassword) {
        return res.status(400).json({
          status: 'error',
          message: 'New password must be different from current password',
        });
      }

      // Hash the new password
      updateData.passwordHash = await bcrypt.hash(updateData.password, 10);
      delete updateData.password;
      delete updateData.currentPassword;
    }

    // Check if the email is being updated and if it's already in use by another user
    if (updateData.email && updateData.email !== user.email) {
      const emailExists = await prisma.user.findFirst({
        where: { 
          email: updateData.email, 
          NOT: { id: user.id },
          isDeleted: false 
        },
      });
      if (emailExists) {
        return res.status(400).json({
          status: 'error',
          message: 'Email is already in use by another user',
        });
      }
    }

    // Check if the username is being updated and if it's already in use by another user
    if (updateData.username && updateData.username !== user.username) {
      const usernameExists = await prisma.user.findFirst({
        where: { 
          username: updateData.username, 
          NOT: { id: user.id },
          isDeleted: false 
        },
      });
      if (usernameExists) {
        return res.status(400).json({
          status: 'error',
          message: 'Username is already in use by another user',
        });
      }
    }

    // Check if the phone is being updated and if it's already in use by another user
    if (updateData.phone && updateData.phone !== user.phone) {
      // Normalize the phone number 
      const normalizedPhone = normalizeToE164(updateData.phone);
      
      if (!normalizedPhone) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid phone number format. Please provide a valid phone number',
        });
      }
      // Check if normalized phone already exists
      const phoneExists = await prisma.user.findFirst({
        where: { 
          phone: normalizedPhone, 
          NOT: { id: user.id },
          isDeleted: false 
        },
      });
      if (phoneExists) {
        return res.status(400).json({
          status: 'error',
          message: 'Phone number is already in use by another user',
        });
      }

      // Update with normalized phone
      updateData.phone = normalizedPhone;
    }

    // Remove any undefined, null, or empty string values
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined || updateData[key] === null || updateData[key] === '') {
        delete updateData[key];
      }
    });

    // If no valid fields remain after cleanup
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        status: 'fail',
        message: 'No valid data provided for update.',
      });
    }

    // Add version increment for optimistic concurrency
    updateData.version = { increment: 1 };

    // Update user with version check
    const updatedUser = await prisma.user.update({
      where: { 
        id: user.id,
        version: user.version
      },
      data: updateData,
      select: {
        id: true,
        firstname: true,
        middlename: true,
        lastname: true,
        username: true,
        email: true,
        phone: true,
        role: true,
        isVerified: true,
        profilePicture: true,
        rating: true,
        bio: true,
        location: true,
        createdAt: true,
        updatedAt: true,
        version: true
      }
    });

    return res.status(200).json({
      status: 'success',
      message: 'User updated successfully',
      data: {
        user: updatedUser,
      },
    });

  } catch (error) {
    logger.error('Update user error:', {
      error: error.message,
      stack: error.stack,
      userId: req.params.id,
      actorId: req.user?.id,
    });

    if (error.code === 'P2025') {
      return res.status(409).json({
        status: 'error',
        message: 'This user was modified by another user. Please refresh and try again.'
      });
    }

    return res.status(500).json({
      status: 'error',
      message: 'Error updating user',
      ...(process.env.NODE_ENV === 'development' && { 
        error: error.message,
        code: error.code 
      }),
    });
  }
};