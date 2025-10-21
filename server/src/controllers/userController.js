import {
  listUsersPrisma,
  findUserByIdPrisma,
  findUserByEmailPrisma,
  findUserByUsernamePrisma,
  findUserByPhonePrisma,
  hardDeleteUserWithRelatedDataPrisma,
  softDeleteUserPrisma,
  restoreUserPrisma,
  updateUserDataPrisma,
  updateUserProfilePicturePrisma,
  removeUserProfilePicturePrisma,
  canDeleteUserPrisma,
} from '../repositories/userRepo.prisma.js';
import bcrypt from 'bcryptjs';
import { getCloudinary } from '../config/cloudinary.js';
import { normalizeToE164 } from '../utils/format.js';
import logger from '../utils/logger.js';

// @desc    Get a single user by ID (admin only)
// @route   GET /api/users/:id
// @access  Private/Admin
// @param   {string} id - User ID
// @returns {Promise<Object>} - User object or error response
export const getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const { fields } = req.query;

    if (!id || typeof id !== 'string' || id.trim() === '') {
      logger.warn('Invalid user ID provided to getUserById', { userId: id });
      return res.status(400).json({
        status: 'error',
        message: 'Invalid user ID',
      });
    }

    const isAdmin = req.user.role === 'admin';
    if (!isAdmin) {
      return res.status(403).json({
        status: 'error',
        message: 'Not authorized to access this user',
      });
    }

    const fieldList = fields ? fields.split(',').map(f => f.trim()) : undefined;
    const user = await findUserByIdPrisma(id, fieldList, { allowSensitive: false });

    if (!user) {
      logger.warn('User not found', { userId: id });
      return res.status(404).json({
        status: 'error',
        message: 'User not found',
      });
    }

    if (user.isDeleted) {
      logger.warn('Attempted to access deactivated user', { userId: id });
      return res.status(410).json({
        status: 'error',
        message: 'User is deactivated',
        data: { ...user, isActive: false },
      });
    }

    logger.info('User found', {
      userId: user.id,
      email: user.email,
      username: user.username,
    });

    return res.status(200).json({
      status: 'success',
      data: user,
    });
  } catch (error) {
    logger.error('Error in getUserById', {
      error: error.message,
      stack: error.stack,
      userId: req.params?.id,
    });
    return res.status(500).json({
      status: 'error',
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// @desc    Get all users (admin only)
// @route   GET /api/users
// @access  Private/Admin
// @desc    Get all users with filtering and pagination
export const getAllUsers = async (req, res) => {
  try {
    // Get query parameters
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
      fields,
    } = req.query;

    const isAdmin = req.user.role === 'admin';

    // Only admins can see soft-deleted users
    if ((status === 'deleted' || status === 'all') && !isAdmin) {
      return res.status(403).json({
        status: 'error',
        message: 'Only admins can view deleted users',
      });
    }

    // Fetch via repository
    const result = await listUsersPrisma({
      role,
      isVerified: isVerified ? isVerified === 'true' : undefined,
      rating: rating ? parseFloat(rating) : undefined,
      search,
      page: parseInt(page),
      limit: parseInt(limit),
      sort,
      status,
      lastActiveAfter,
      lastActiveBefore,
      fields: fields ? fields.split(',').map(f => f.trim()) : undefined,
      allowSensitive: isAdmin, // Only allow sensitive fields for admins
    });

    res.status(200).json({
      status: 'success',
      pagination: result.pagination,
      data: result.data,
    });
  } catch (error) {
    logger.error('Get all users error:', {
      error: error.message,
      stack: error.stack,
      query: JSON.stringify(req.query),
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

    const getPermanentValue = value => {
      if (value == null) return false;
      if (typeof value === 'string') return value.toLowerCase() === 'true';
      return !!value;
    };
    // Accept permanent from query string (?permanent=true) and fallback to body for backward compatibility
    const permanent =
      getPermanentValue(req.query?.permanent) || getPermanentValue(req.body?.permanent);

    // Get user with necessary fields for deletion
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

      const isMatch = user.passwordHash ? await bcrypt.compare(password, user.passwordHash) : false;
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

    // Prevent soft deletion of already deleted users
    if (user.isDeleted && !permanent) {
      return res.status(400).json({
        status: 'error',
        message: 'User account has been already deactivated',
      });
    }

    // First check if user can be deleted
    const { canDelete, reason } = await canDeleteUserPrisma(user.id);
    if (!canDelete) {
      return res.status(400).json({
        status: 'error',
        message: reason
      });
    }

    try {
      if (permanent) {
        // Delete user's profile picture on Cloudinary if it exists
        if (user.profilePicture?.publicId) {
          try {
            const cloudinary = getCloudinary();
            await cloudinary.uploader.destroy(user.profilePicture.publicId);
          } catch (error) {
            logger.error('Error deleting profile picture:', {
              error: error.message,
              userId: user.id,
              publicId: user.profilePicture.publicId,
              stack: error.stack
            });
            // Continue even if Cloudinary deletion fails
          }
        }

        // Delete images from Cloudinary if they exist
        if (auction.images?.length > 0) {
          try {
            const cloudinary = await getCloudinary();
            await Promise.all(
              auction.images.map(async (img) => {
                if (img.publicId) {
                  await cloudinary.uploader.destroy(img.publicId);
                }
              })
            );
          } catch (error) {
            logger.error('Error deleting images:', {
              error: error.message,
              stack: error.stack,
              auctionId: auction.id,
              userId: actorId,
            });
            // Continue with deletion even if image deletion fails
          }
        }

        // Hard delete with related data
        await hardDeleteUserWithRelatedDataPrisma(user.id);
      } else {
        // Soft delete with cleanup
        await softDeleteUserPrisma(user.id, actorId, user.version);
      }
    } catch (error) {
      logger.error('Error during user deletion:', {
        error: error.message,
        userId: user.id,
        permanent,
        stack: error.stack
      });
      throw error;
    }

    // Log the deletion
    logger.info('User deleted', {
      userId: user.id,
      deletedBy: actorId,
      permanent,
      timestamp: new Date().toISOString(),
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
      userId: typeof req.params.id === 'string' ? req.params.id : req.params.id?.id || '[unknown]',
      permanent: req.query?.permanent,
    });

    if (error.code === 'P2025') {
      return res.status(409).json({
        status: 'error',
        message: 'This user was modified by another user. Please refresh and try again.',
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
    // Get the current user's ID from the authenticated request
    const userId = req.user.id;

    // Fetch the user with only necessary fields
    const user = await findUserByIdPrisma(userId, [
      'id',
      'firstname',
      'middlename',
      'lastname',
      'email',
      'username',
      'phone',
      'role',
      'profilePicture',
      'bio',
      'location',
      'rating',
      'ratingCount',
      'isVerified',
      'createdAt',
      'updatedAt',
      'lastActiveAt',
    ], { allowSensitive: false });

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found',
      });
    }

    // Update last active timestamp
    await updateUserDataPrisma(user.id, { lastActiveAt: new Date() });

    return res.status(200).json({
      status: 'success',
      data: { user },
    });
  } catch (error) {
    logger.error('Get current user error:', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
    });

    return res.status(500).json({
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
    const { role } = req.user;
    const userId = req.params.id;

    // Only admins can restore users
    if (role !== 'admin') {
      return res.status(403).json({
        status: 'error',
        message: 'Only admins can restore users',
      });
    }

    // Get user with minimal fields needed for restoration
    const user = await findUserByIdPrisma(userId, [
      'id',
      'isDeleted',
      'firstname',
      'middlename',
      'lastname',
      'email',
      'username',
      'role',
      'version',
    ], { allowSensitive: true });

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

    // Restore the user using repository function
    await restoreUserPrisma(user.id);

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
          version: user.version,
        },
      },
    });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(409).json({
        status: 'error',
        message: 'This user was modified by another user. Please refresh and try again.',
      });
    }

    logger.error('Restore user error:', {
      error: error.message,
      stack: error.stack,
      userId: typeof req.params.id === 'string' ? req.params.id : req.params.id?.id || '[unknown]',
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
    // Get current user to check for existing picture
    const user = await findUserByIdPrisma(actorId, ['profilePicture'], { allowSensitive: false });

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
      uploadedAt: new Date().toISOString(),
    };

    // Update user with new profile picture
    await updateUserProfilePicturePrisma(actorId, profilePicture);

    res.status(200).json({
      success: true,
      message: 'Profile picture uploaded successfully',
      data: { profilePicture },
    });
  } catch (error) {
    logger.error('Error uploading profile picture:', {
      error: error.message,
      stack: error.stack,
      userId: typeof req.user?.id === 'string' ? req.user.id : req.user?.id?.id || '[unknown]',
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
    // Get current user to check for existing picture
    const user = await findUserByIdPrisma(actorId, ['profilePicture'], { allowSensitive: false });

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

    // Remove profile picture URL using repository
    await removeUserProfilePicturePrisma(actorId);

    res.status(200).json({
      success: true,
      message: 'Profile picture deleted successfully',
    });
  } catch (error) {
    logger.error('Error removing profile picture:', {
      error: error.message,
      stack: error.stack,
      userId: typeof req.user?.id === 'string' ? req.user.id : req.user?.id?.id || '[unknown]',
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
    if (
      !updateData ||
      Object.keys(updateData).length === 0 ||
      Object.values(updateData).every(v => v === '' || v === null || v === undefined)
    ) {
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
      const existingUser = await findUserByEmailPrisma(updateData.email, ['id', 'isDeleted'], { allowSensitive: false });

      // Check if email exists and belongs to a different active user
      if (existingUser && existingUser.id !== user.id && !existingUser.isDeleted) {
        return res.status(400).json({
          status: 'error',
          message: 'Email is already in use by another user',
        });
      }

      // Also check if the email belongs to a deleted user
      if (existingUser && existingUser.id !== user.id && existingUser.isDeleted) {
        return res.status(400).json({
          status: 'error',
          message: 'This email was previously used by another account',
        });
      }
    }

    // Check if the username is being updated and if it's already in use by another user
    if (updateData.username && updateData.username !== user.username) {
      const usernameExists = await findUserByUsernamePrisma(updateData.username, ['id', 'isDeleted'], { allowSensitive: false });

      // Check if username exists and belongs to a different active user
      if (usernameExists && usernameExists.id !== user.id && !usernameExists.isDeleted) {
        return res.status(400).json({
          status: 'error',
          message: 'Username is already in use by another user',
        });
      }

      // Also check if the username belongs to a deleted user
      if (usernameExists && usernameExists.id !== user.id && usernameExists.isDeleted) {
        return res.status(400).json({
          status: 'error',
          message: 'This username was previously used by another account',
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
      const phoneExists = await findUserByPhonePrisma(normalizedPhone, ['id', 'isDeleted'], { allowSensitive: false });

      // Check if phone exists and belongs to a different active user
      if (phoneExists && phoneExists.id !== user.id && !phoneExists.isDeleted) {
        return res.status(400).json({
          status: 'error',
          message: 'Phone number is already in use by another user',
        });
      }

      // Also check if the phone belongs to a deleted user
      if (phoneExists && phoneExists.id !== user.id && phoneExists.isDeleted) {
        return res.status(400).json({
          status: 'error',
          message: 'This phone number was previously used by another account',
        });
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
      return res.status(400).json({
        status: 'fail',
        message: 'No data provided for update.',
      });
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

    if (error.code === 'P2025') {
      return res.status(409).json({
        status: 'error',
        message: 'This user was modified by another user. Please refresh and try again.',
      });
    }

    return res.status(500).json({
      status: 'error',
      message: 'Error updating user',
      ...(process.env.NODE_ENV === 'development' ? {
        error: error.message,
        code: error.code,
      } : {}),
    });
  }
};