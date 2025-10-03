import { listUsersPrisma } from '../repositories/userRepo.prisma.js';
import prisma from '../config/prisma.js';
import bcrypt from 'bcryptjs';
import { getCloudinary } from '../config/cloudinary.js';
import { normalizeToE164 } from '../utils/format.js';
import logger from '../utils/logger.js';

// @desc    Get a single user by ID
// @param   {string} id - User ID
// @returns {Promise<Object|null>} - User object or null if not found
export const getUserById = async (id) => {
  try {
    if (!id) {
      logger.warn('No user ID provided to getUserById');
      return null;
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        firstname: true,
        lastname: true,
        username: true,
        email: true,
        phone: true,
        role: true,
        isVerified: true,
        isDeleted: true,
        profilePicture: true,
        rating: true,
        lastActiveAt: true,
        createdAt: true,
        updatedAt: true,
        version: true
      },
    });

    if (!user) {
      logger.warn('User not found', { userId: id });
      return null;
    }

    if (user.isDeleted) {
      logger.warn('Attempted to access deleted user', { userId: id });
      return { ...user, isActive: false };
    }

    return user;
  } catch (error) {
    logger.error('Error in getUserById', {
      error: error.message,
      stack: error.stack,
      userId: id
    });
    throw error;
  }
};

// @desc    Get all users (admin only)
// @route   GET /api/users
// @access  Private/Admin
export const getAllUsers = async (req, res) => {
  try {
    // Get query parameters (already validated by middleware)
    const {
      role,
      isVerified,
      rating,
      search,
      page = 1,
      limit = 10,
      sort = 'createdAt:desc',
      status,
      lastActiveAfter,
      lastActiveBefore,
    } = req.query;

    // Only admins can see soft-deleted users
    if ((status === 'deleted' || status === 'all') && req.user.role !== 'admin') {
      return res.status(403).json({
        status: 'error',
        message: 'Only admins can view deleted users',
      });
    }

    // Fetch via Prisma repository
    const { users, count, pageNum, take } = await listUsersPrisma({
      role,
      isVerified,
      rating,
      search,
      page,
      limit,
      sort,
      status,
      lastActiveAfter,
      lastActiveBefore,
    });
    const totalPages = Math.ceil(count / take);

    res.status(200).json({
      status: 'success',
      pagination: {
        currentPage: pageNum,
        totalUsers: count,
        totalPages,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
      data: {
        users,
      },
    });
  } catch (error) {
    logger.error('Get all users error:', {
      error: error.message,
      stack: error.stack,
      query: req.query,
    });

    res.status(500).json({
      status: 'error',
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// @desc    Delete a user
// @route   DELETE /api/users/:id
// @access  Private/Admin
export const deleteUser = async (req, res) => {
  try {
    const { password } = req.body || {};
    // Accept permanent from query string (?permanent=true) and fallback to body for backward compatibility
    const permanent =
      (typeof req.query?.permanent === 'string'
        ? req.query.permanent.toLowerCase() === 'true'
        : !!req.query?.permanent) ||
      (typeof req.body?.permanent === 'string'
        ? req.body.permanent.toLowerCase() === 'true'
        : !!req.body?.permanent);

    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        role: true,
        passwordHash: true,
        isDeleted: true,
        version: true,
        email: true,
        username: true
      },
    });

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found',
      });
    }

    // Allow deletion only if admin or the user themselves
    const actorId = req.user?.id?.toString();
    if (user.id.toString() !== actorId && req.user.role !== 'admin') {
      return res.status(403).json({
        status: 'error',
        message: 'Not authorized to delete this user',
      });
    }

    // If user is deleting their own account, require password
    if (user.id.toString() === actorId) {
      if (!password) {
        return res.status(400).json({
          status: 'error',
          message: 'Password is required to confirm account deletion',
        });
      }

      const isMatch = user.passwordHash
        ? await bcrypt.compare(password, user.passwordHash)
        : false;
      if (!isMatch) {
        return res.status(400).json({
          status: 'error',
          message: 'Incorrect password',
        });
      }
    }

    // Prevent admin from deleting themselves
    if (user.role === 'admin' && user.id.toString() === actorId) {
      return res.status(400).json({
        status: 'error',
        message: 'Admins cannot delete themselves. Please contact another admin for assistance.',
      });
    }

    // Only admins can perform permanent deletions
    if (permanent && req.user.role !== 'admin') {
      return res.status(403).json({
        status: 'error',
        message: 'Only admins can permanently delete users',
      });
    }

    if (permanent) {
        // Cascade delete related data, then delete the user with version check
        await prisma.$transaction([
          prisma.auction.deleteMany({ where: { sellerId: user.id } }),
          prisma.bid.deleteMany({ where: { bidderId: user.id } }),
          prisma.user.delete({
            where: {
              id: user.id,
              version: user.version // Optimistic concurrency control
            }
          }),
        ]);
    } else {
      // Soft delete with version check
      const deletedUser = await prisma.user.update({
        where: { 
          id: user.id,
          version: user.version // Optimistic concurrency control
        },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
          deletedById: actorId,
          version: { increment: 1 }, // Increment version
          // Clear sensitive data
          email: `deleted-${Date.now()}-${user.id}@deleted.user`,
          username: `deleted-${Date.now()}-${user.id}`,
          passwordHash: null,
          refreshToken: null
        }
      });

      if (!deletedUser) {
        throw new Error('Failed to soft delete user - version mismatch');
      }
    }

    // Log the deletion
    logger.info('User deleted', {
      userId: user.id,
      deletedBy: actorId,
      permanent,
      timestamp: new Date().toISOString()
    });

    res.status(200).json({
      status: 'success',
      data: null,
      message: permanent
        ? 'User and all associated data have been permanently deleted'
        : 'User account has been deactivated',
    });
  } catch (error) {
    logger.error('Delete user error:', {
      error: error.message,
      stack: error.stack,
      userId: req.params.id,
      permanent: req.query.permanent,
    });

    if (error.code === 'P2025') {
      return res.status(409).json({
        status: 'error',
        message: 'This user was modified by another user. Please refresh and try again.'
      });
    }

    res.status(500).json({
      status: 'error',
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// @desc    Get current user
// @route   GET /api/users/me
// @access  Private
export const getMe = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        firstname: true,
        middlename: true,
        lastname: true,
        lastActiveAt: true,
        username: true,
        email: true,
        phone: true,
        profilePicture: true,
        role: true,
        rating: true,
        bio: true,
        location: true,
        isVerified: true,
        isDeleted: true,
        deletedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Format the response
    const userData = {
      ...user,
      fullname: `${user.firstname} ${user.lastname}`.trim(),
    };

    res.status(200).json({
      success: true,
      data: userData,
    });
  } catch (error) {
    logger.error('Get me error:', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
    });
    res.status(500).json({
      status: 'error',
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// @desc    Restore a soft-deleted user
// @route   POST /api/users/:id/restore
// @access  Private/Admin
export const restoreUser = async (req, res) => {
  try {
    // Only admins can restore users
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        status: 'error',
        message: 'Only admins can restore users',
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, isDeleted: true, firstname: true, middlename: true, lastname: true, email: true, username: true, role: true },
    });

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found',
      });
    }

    if (!user.isDeleted) {
      return res.status(400).json({
        status: 'error',
        message: 'User is not deleted',
      });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { isDeleted: false, deletedAt: null, deletedById: null },
    });

    res.status(200).json({
      status: 'success',
      message: 'User restored successfully',
      data: {
        user: {
          id: user.id,
          firstname: user.firstname,
          middlename: user.middlename,
          lastname: user.lastname,
          email: user.email,
          username: user.username,
          role: user.role,
        },
      },
    });
  } catch (error) {
    logger.error('Restore user error:', {
      error: error.message,
      stack: error.stack,
      userId: req.params.id,
    });
    res.status(500).json({
      status: 'error',
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// @desc    Upload profile picture
// @route   POST /api/users/me/upload-picture
// @access  Private
export const uploadProfilePicture = async (req, res) => {
  try {
    if (!req.uploadedFiles || req.uploadedFiles.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded or file upload failed',
      });
    }

    const uploadedFile = req.uploadedFiles[0];
    const actorId = req.user?.id?.toString();
    const user = await prisma.user.findUnique({
      where: { id: actorId },
      select: {
        id: true,
        profilePicture: true
      }
    });

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found',
      });
    }

    // Delete old profile picture if exists
    if (user.profilePicture?.publicId) {
      try {
        const cloudinary = await getCloudinary();
        await cloudinary.uploader.destroy(user.profilePicture.publicId);
      } catch (error) {
        logger.error('Error deleting old profile picture:', {
          error: error.message,
          stack: error.stack,
          userId: actorId,
          publicId: user.profilePicture.publicId,
        });
      }
    }

    // Create new profile picture object
    const profilePicture = {
      url: uploadedFile.url,
      publicId: uploadedFile.publicId,
      uploadedAt: new Date().toISOString()
    };

    // Update user with new profile picture
    await prisma.user.update({
      where: { id: actorId },
      data: { profilePicture },
    });

    res.status(200).json({
      success: true,
      message: 'Profile picture uploaded successfully',
      data: { profilePicture },
    });
  } catch (error) {
    logger.error('Error uploading profile picture:', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
    });
    res.status(500).json({
      success: false,
      message: 'Server error while uploading profile picture',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// @desc    Delete profile picture
// @route   DELETE /api/users/me/remove-picture
// @access  Private
export const deleteProfilePicture = async (req, res) => {
  try {
    const actorId = req.user?.id?.toString();
    const user = await prisma.user.findUnique({
      where: { id: actorId },
      select: { id: true, profilePicture: true }
    });

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found',
      });
    }

    if (!user.profilePicture?.publicId) {
      return res.status(400).json({
        success: false,
        message: 'No profile picture to delete',
      });
    }

    // Delete from Cloudinary
    try {
      const cloudinary = await getCloudinary();
      await cloudinary.uploader.destroy(user.profilePicture.publicId);
    } catch (error) {
      logger.error('Error deleting profile picture from Cloudinary:', {
        error: error.message,
        stack: error.stack,
        userId: actorId,
        publicId: user.profilePicture.publicId,
      });
      // Continue even if Cloudinary deletion fails
    }

    // Remove from user
    await prisma.user.update({
      where: { id: actorId },
      data: { profilePicture: null },
    });

    res.status(200).json({
      success: true,
      message: 'Profile picture deleted successfully',
    });
  } catch (error) {
    logger.error('Error removing profile picture:', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
    });
    res.status(500).json({
      success: false,
      message: 'Server error while removing profile picture',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

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
        message: 'No data provided for update.',
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
        message: 'No data provided for update.',
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