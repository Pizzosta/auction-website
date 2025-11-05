export const updateUser = async (req, res, next) => {
  try {
    const updateData = { ...req.body };

    // Ensure the request body is not empty before proceeding
    if (
      !updateData ||
      Object.keys(updateData).length === 0 ||
      Object.values(updateData).every(v => v === '' || v === null || v === undefined)
    ) {
      return next(new AppError('NO_UPDATE_DATA', 'No data provided for update.', 400));
    }

    // Ensure request has a valid user object (from protect middleware)
    if (!req.user?.id) {
      return next(new AppError('AUTHENTICATION_REQUIRED', 'Authentication required', 401));
    }

    // Find the user and include the password hash for verification
    const user = await findUserByIdPrisma(req.params.id, [
      'id',
      'role',
      'passwordHash',
      'isDeleted',
      'email',
      'username',
      'phone',
      'version',
    ],
      { allowSensitive: true });

    if (!user) {
      return next(new AppError('NOT_FOUND', 'User not found', 404));
    }

    // Check if the user is updating their own profile or is an admin
    const actorId = req.user.id.toString();
    if (user.id.toString() !== actorId && req.user.role !== 'admin') {
      return next(new AppError('FORBIDDEN', 'Not authorized to update this user', 403));
    }

    // Prevent role modification by non-admins
    if (updateData.role && updateData.role !== user.role && req.user.role !== 'admin') {
      return next(new AppError('FORBIDDEN', 'Not authorized to modify user role', 403));
    }

    // Handle password update with enhanced validation
    if (updateData.password) {
      if (!updateData.currentPassword) {
        return next(new AppError('CURRENT_PASSWORD_REQUIRED', 'Current password is required to update password', 400));
      }

      const isPasswordValid = user.passwordHash
        ? await bcrypt.compare(updateData.currentPassword, user.passwordHash)
        : false;
      if (!isPasswordValid) {
        return next(new AppError('CURRENT_PASSWORD_INCORRECT', 'Current password is incorrect', 400));
      }

      const isSamePassword = user.passwordHash
        ? await bcrypt.compare(updateData.password, user.passwordHash)
        : false;
      if (isSamePassword) {
        return next(new AppError('PASSWORD_SAME', 'New password must be different from current password', 400));
      }

      // Hash the new password
      updateData.passwordHash = await bcrypt.hash(updateData.password, 10);
      delete updateData.password;
      delete updateData.currentPassword;
    }

    // Check if the email is being updated and if it's already in use by another user
    if (updateData.email && updateData.email !== user.email) {
      const existingUser = await findUserByEmailPrisma(updateData.email, ['id', 'isDeleted'], { allowSensitive: false });

      // Check if email exists and belongs to a different active user
      if (existingUser && existingUser.id !== user.id && !existingUser.isDeleted) {
        return next(new AppError('EMAIL_IN_USE', 'Email is already in use by another user', 400));
      }

      // Also check if the email belongs to a deleted user
      if (existingUser && existingUser.id !== user.id && existingUser.isDeleted) {
        return next(new AppError('EMAIL_PREVIOUSLY_USED', 'This email was previously used by another account', 400));
      }
    }

    // Check if the username is being updated and if it's already in use by another user
    if (updateData.username && updateData.username !== user.username) {
      const usernameExists = await findUserByUsernamePrisma(updateData.username, ['id', 'isDeleted'], { allowSensitive: false });

      // Check if username exists and belongs to a different active user
      if (usernameExists && usernameExists.id !== user.id && !usernameExists.isDeleted) {
        return next(new AppError('USERNAME_IN_USE', 'Username is already in use by another user', 400));
      }

      // Also check if the username belongs to a deleted user
      if (usernameExists && usernameExists.id !== user.id && usernameExists.isDeleted) {
        return next(new AppError('USERNAME_PREVIOUSLY_USED', 'This username was previously used by another account', 400));
      }
    }

    // Check if the phone is being updated and if it's already in use by another user
    if (updateData.phone && updateData.phone !== user.phone) {
      // Normalize the phone number
      const normalizedPhone = normalizeToE164(updateData.phone);

      if (!normalizedPhone) {
        return next(new AppError('INVALID_PHONE_NUMBER', 'Invalid phone number format. Please provide a valid phone number', 400));
      }
      // Check if normalized phone already exists
      const phoneExists = await findUserByPhonePrisma(normalizedPhone, ['id', 'isDeleted'], { allowSensitive: false });

      // Check if phone exists and belongs to a different active user
      if (phoneExists && phoneExists.id !== user.id && !phoneExists.isDeleted) {
        return next(new AppError('PHONE_IN_USE', 'Phone number is already in use by another user', 400));
      }

      // Also check if the phone belongs to a deleted user
      if (phoneExists && phoneExists.id !== user.id && phoneExists.isDeleted) {
        return next(new AppError('PHONE_PREVIOUSLY_USED', 'This phone number was previously used by another account', 400));
      }

      // Update the phone number
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
      return next(new AppError('NO_UPDATE_DATA', 'No data provided for update.', 400));
    }

    // Add version increment for optimistic concurrency
    updateData.version = { increment: 1 };

    // Update user with version check using repository
    const updatedUser = await updateUserDataPrisma(user.id, updateData, [
      'id',
      'firstname',
      'middlename',
      'lastname',
      'username',
      'email',
      'phone',
      'role',
      'isVerified',
      'profilePicture',
      'rating',
      'bio',
      'location',
      'createdAt',
      'updatedAt',
      'version'
    ], { allowSensitive: true });

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
      userId: typeof req.params.id === 'string' ? req.params.id : req.params.id?.id || '[unknown]',
      actorId: typeof req.user?.id === 'string' ? req.user.id : req.user?.id?.id || '[unknown]',
    });

    // Override P2025 for concurrency conflicts only
    if (error.code === 'P2025') {
      return next(new AppError('CONFLICT', 'This user was modified by another user. Please refresh and try again.', 409));
    }

    next(error);
  }
};