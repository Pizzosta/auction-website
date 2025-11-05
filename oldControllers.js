import { listUsersPrisma } from '../repositories/userRepo.prisma.js';
import prisma from '../config/prisma.js';
import bcrypt from 'bcryptjs';
import { getCloudinary } from '../config/cloudinary.js';
import { normalizeToE164 } from '../utils/format.js';
import logger from '../utils/logger.js';

// @desc    Get a single user by ID (admin only)
// @route   GET /api/users/:id
// @access  Private/Admin
// @param   {string} id - User ID
// @returns {Promise<Object|null>} - User object or null if not found
export const getUserById = async (req, res) => {
  try {
    const id = req.params?.id;
    if (!id || typeof id !== 'string' || id.trim() === '') {
      logger.warn('Invalid user ID provided to getUserById', {
        userId: id,
      });
      return res.status(400).json({
        status: 'error',
        message: 'Invalid user ID',
      });
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
        version: true,
      },
    });

    if (!user) {
      logger.warn('User not found', { userId: id });
      return res.status(404).json({
        status: 'error',
        message: 'User not found',
      });
    }

    if (user.isDeleted) {
      logger.warn('Attempted to access deleted user', { userId: id });
      return res.status(410).json({
        status: 'error',
        message: 'User is deleted',
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

    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        role: true,
        passwordHash: true,
        isDeleted: true,
        version: true,
        email: true,
        username: true,
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

    if (permanent) {
      // Cascade delete related data, then delete the user with version check
      await prisma.$transaction([
        prisma.auction.deleteMany({ where: { sellerId: user.id } }),
        prisma.bid.deleteMany({ where: { bidderId: user.id } }),
        prisma.user.delete({
          where: {
            id: user.id,
            version: user.version, // Optimistic concurrency control
          },
        }),
      ]);
    } else {
      // Soft delete with version check
      const deletedUser = await prisma.user.update({
        where: {
          id: user.id,
          version: user.version, // Optimistic concurrency control
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
          refreshToken: null,
        },
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
      fullname: `${user.firstname} ${user.middlename} ${user.lastname}`.trim(),
    };

    res.status(200).json({
      success: true,
      data: userData,
    });
  } catch (error) {
    logger.error('Get me error:', {
      error: error.message,
      stack: error.stack,
      userId: typeof req.user?.id === 'string' ? req.user.id : req.user?.id?.id || '[unknown]',
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
      select: {
        id: true,
        isDeleted: true,
        firstname: true,
        middlename: true,
        lastname: true,
        email: true,
        username: true,
        role: true,
      },
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
    const user = await prisma.user.findUnique({
      where: { id: actorId },
      select: {
        id: true,
        profilePicture: true,
      },
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
      uploadedAt: new Date().toISOString(),
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
    const user = await prisma.user.findUnique({
      where: { id: actorId },
      select: { id: true, profilePicture: true },
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
          isDeleted: false,
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
          isDeleted: false,
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
          isDeleted: false,
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
        version: user.version,
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
        version: true,
      },
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
      ...(process.env.NODE_ENV === 'development' && {
        error: error.message,
        code: error.code,
      }),
    });
  }
};

// Internal helper for user lookup by ID (returns user object or null)
export const findUserById = async id => {
  if (!id || typeof id !== 'string' || id.trim() === '') return null;
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
      version: true,
    },
  });
  logger.debug('findUserById raw result', { id, user });
  return user;
};

export async function listUsersPrisma({
  page = 1,
  limit = 10,
  sort = 'createdAt:desc',
  status,
  search = '',
  role = '',
  isVerified,
  rating,
  lastActiveAfter,
  lastActiveBefore,
  fields,
}) {
  const pageNum = Math.max(1, parseInt(page));
  const take = Math.min(Math.max(1, parseInt(limit)), 100);
  const skip = (pageNum - 1) * take;

  // Build where filter
  const where = {};

  // Handle status filter (case-insensitive via normalization)
  if (status) {
    const normalizedStatus = status.toLowerCase();
    if (normalizedStatus === 'active') {
      where.isDeleted = { not: true };
    } else if (normalizedStatus === 'deleted') {
      where.isDeleted = true;
    } else if (normalizedStatus === 'all') {
      // no filter
    } else {
      // fallback for unknown status strings
      where.status = normalizedStatus;
    }
  }

  if (role) where.role = role;
  if (typeof isVerified !== 'undefined') where.isVerified = isVerified === 'true' || isVerified === true;
  if (typeof rating !== 'undefined') where.rating = Number(rating);

  // Handle lastActiveAt filters
  if (lastActiveAfter || lastActiveBefore) {
    where.lastActiveAt = {};

    if (lastActiveAfter) {
      where.lastActiveAt.gte = new Date(lastActiveAfter);
    }

    if (lastActiveBefore) {
      where.lastActiveAt.lte = new Date(lastActiveBefore);
    }
  }

  if (search) {
    const s = String(search);
    where.OR = [
      { firstname: { contains: s, mode: 'insensitive' } },
      { lastname: { contains: s, mode: 'insensitive' } },
      { email: { contains: s, mode: 'insensitive' } },
      { phone: { contains: s, mode: 'insensitive' } },
      { username: { contains: s, mode: 'insensitive' } },
    ];
  }

  // Sort mapping
  let [field, order] = String(sort).split(':');
  if (!field) field = 'createdAt';
  const allowed = new Set(['firstname', 'lastname', 'email', 'phone', 'username', 'createdAt']);
  if (!allowed.has(field)) field = 'createdAt';
  const orderBy = { [field]: order === 'asc' ? 'asc' : 'desc' };

  // Build select object based on requested fields
  const select = createUserSelect(fields);

  const [count, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy,
      skip,
      take,
      select
    }),
  ]);

  const shaped = users.map(u => ({
    ...u,
    profilePicture: u.profilePicture || null
  }));

  const totalPages = Math.ceil(count / take) || 1;

  return {
    data: shaped,
    pagination: {
      currentPage: pageNum,
      totalItems: count,
      totalPages,
      itemsPerPage: take,
      hasNext: pageNum < totalPages,
      hasPrev: pageNum > 1,
    },
  };
}

import prisma from '../config/prisma.js';
import bcrypt from 'bcryptjs';
import zxcvbn from 'zxcvbn';
import crypto from 'crypto';
import { addToQueue } from '../services/emailQueue.js';
import logger from '../utils/logger.js';
import { env, validateEnv } from '../config/env.js';
import { generateAccessToken, generateRefreshToken } from '../services/tokenService.js';
import { normalizeToE164, parseDuration } from '../utils/format.js';
import jwt from 'jsonwebtoken';

// Validate required environment variables
const missingVars = validateEnv();
if (missingVars.length > 0) {
  logger.error(`Missing required environment variables: ${missingVars.join(', ')}`);
  process.exit(1);
}

// Password strength checker
const checkPasswordStrength = password => {
  const hasMinLength = password.length >= 8;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecialChar = /[^A-Za-z0-9]/.test(password);

  return {
    isValid: hasMinLength && hasUpperCase && hasLowerCase && hasNumbers && hasSpecialChar,
    issues: {
      minLength: !hasMinLength ? 'Must be at least 8 characters' : null,
      upperCase: !hasUpperCase ? 'Must contain at least one uppercase letter' : null,
      lowerCase: !hasLowerCase ? 'Must contain at least one lowercase letter' : null,
      numbers: !hasNumbers ? 'Must contain at least one number' : null,
      specialChar: !hasSpecialChar ? 'Must contain at least one special character' : null,
    },
  };
};

export const register = async (req, res) => {
  try {
    const { firstname, middlename, lastname, phone, username, email, password, confirmPassword } =
      req.body;

    // Check password match
    if (password !== confirmPassword) {
      return res.status(400).json({
        status: 'error',
        message: 'Passwords do not match',
      });
    }

    // Check password strength
    const passwordCheck = checkPasswordStrength(password);
    if (!passwordCheck.isValid) {
      return res.status(400).json({
        status: 'error',
        message: 'Password does not meet requirements',
        issues: Object.values(passwordCheck.issues).filter(Boolean),
      });
    }

    const strength = zxcvbn(password);
    if (strength.score < 3) {
      return res.status(400).json({
        status: 'error',
        message: 'Password is too weak',
        suggestions: strength.feedback?.suggestions || [],
      });
    }

    const normalizedEmail = email?.trim().toLowerCase();
    const normalizedUsername = username?.trim();
    const normalizedPhone = normalizeToE164(phone?.trim());

    if (!normalizedPhone) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid phone number format',
      });
    }

    // Check if user exists
    const userByEmail = await prisma.user.findFirst({ where: { email: normalizedEmail } });
    if (userByEmail) {
      return res.status(400).json({
        status: 'error',
        message: 'Email is already in use by another user.',
      });
    }

    const userByUsername = await prisma.user.findFirst({ where: { username: normalizedUsername } });
    if (userByUsername) {
      return res.status(400).json({
        status: 'error',
        message: 'Username is already in use by another user.',
      });
    }

    const userByPhone = await prisma.user.findFirst({ where: { phone: normalizedPhone } });
    if (userByPhone) {
      return res.status(400).json({
        status: 'error',
        message: 'Phone number is already in use by another user.',
      });
    }

    // Create user (hash password)
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    const user = await prisma.user.create({
      data: {
        firstname,
        middlename: middlename || '',
        lastname,
        phone: normalizedPhone,
        username: normalizedUsername,
        email: normalizedEmail,
        passwordHash,
        role: 'user',
        lastActiveAt: new Date(),
      },
    });

    // Add welcome email to queue
    try {
      await addToQueue('welcomeUser', user.email, {
        name: user.firstname,
        email: user.email,
        username: user.username,
      });
      logger.info('Welcome User email queued', { userEmail: user.email });
    } catch (error) {
      logger.error('Failed to queue welcome user email:', {
        error: error.message,
        stack: error.stack,
        userEmail: user.email,
      });
      // Continue with registration even if queueing fails
    }

    // Generate access token using the same function as login
    const accessToken = generateAccessToken(user.id, user.email, user.role);
    const refreshToken = await generateRefreshToken(user.id, user.email, user.role);

    // Set refresh token as HTTP-only cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: env.nodeEnv === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.status(201).json({
      status: 'success',
      data: {
        user: {
          id: user.id,
          firstname: user.firstname,
          middlename: user.middlename,
          lastname: user.lastname,
          username: user.username,
          email: user.email,
          phone: user.phone,
          role: user.role,
        },
        accessToken,
        expiresIn: env.accessTokenExpiry,
      },
    });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if user exists
    const user = await prisma.user.findFirst({
      where: { email: email?.trim().toLowerCase() },
      select: {
        id: true,
        firstname: true,
        middlename: true,
        lastname: true,
        username: true,
        email: true,
        phone: true,
        role: true,
        passwordHash: true,
        isDeleted: true,
      },
    });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Check if user is soft-deleted
    if (user.isDeleted) {
      return res.status(403).json({ message: 'User account has been deactivated' });
    }

    // Check password
    const isMatch = user.passwordHash ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Update lastActiveAt timestamp
    await prisma.user.update({
      where: { id: user.id },
      data: { lastActiveAt: new Date() }
    });

    // Generate tokens
    const accessToken = generateAccessToken(user.id, user.email, user.role);
    const refreshToken = await generateRefreshToken(user.id, user.email, user.role);

    // Set refresh token as HTTP-only cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: env.nodeEnv === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.json({
      status: 'success',
      data: {
        user: {
          id: user.id,
          firstname: user.firstname,
          middlename: user.middlename,
          lastname: user.lastname,
          username: user.username,
          email: user.email,
          phone: user.phone,
          role: user.role,
        },
        accessToken,
        expiresIn: env.accessTokenExpiry,
      },
    });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        status: 'error',
        message: 'Email is required',
      });
    }

    // Find user by email
    const user = await prisma.user.findFirst({
      where: { email: email?.trim().toLowerCase() },
      select: { id: true, firstname: true, email: true },
    });

    // Don't reveal if user doesn't exist (security best practice)
    if (!user) {
      return res.status(200).json({
        status: 'success',
        message: 'If an account with that email exists, a password reset link has been sent.',
      });
    }

    // Generate reset token and save hashed version to database
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    // compute expire (default to 10 minutes if not configured)
    const expireMs = parseDuration(env.resetTokenExpire, 10 * 60 * 1000);
    const expireAt = new Date(Date.now() + expireMs);

    // Update user with hashed token and expiry
    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetPasswordToken: hashedToken,
        resetPasswordExpire: expireAt,
      },
    });

    // Create reset URL - use the unhashed token in the URL
    const resetUrl = `${env.clientUrl}/reset-password/${resetToken}`;

    // Send email
    try {
      const rawExpire = env.resetTokenExpire || 10 * 60 * 1000;
      const expireInMinutes = String(rawExpire).endsWith('m')
        ? `${String(rawExpire).replace('m', '')} minutes`
        : String(rawExpire);

      await addToQueue('resetPassword', user.email, {
        name: user.firstname,
        passwordResetLink: resetUrl,
        expiresIn: expireInMinutes,
      });

      return res.status(200).json({
        status: 'success',
        message: 'Password reset link sent to email',
      });
    } catch (error) {
      logger.error('Error sending password reset email:', {
        error: error.message,
        stack: error.stack,
        userEmail: user.email,
      });
      await prisma.user.update({
        where: { id: user.id },
        data: { resetPasswordToken: null, resetPasswordExpire: null },
      });

      // Don't fail the request if email fails
    }

  } catch (error) {
    logger.error('Forgot password error:', {
      error: error.message,
      stack: error.stack,
      userEmail: req.body?.email,
    });
    return res.status(500).json({
      status: 'error',
      message: 'Internal server error',
    });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password, confirmPassword } = req.body;

    if (!token) {
      return res.status(400).json({
        status: 'error',
        message: 'Verification token is required',
      });
    }

    // Check if token is valid
    if (typeof token !== 'string' || token.length !== 64) {
      logger.warn('Reset token validation failed', {
        reason: 'Invalid token type',
        tokenType: typeof token,
        tokenLength: typeof token === 'string' ? token.length : 'N/A',
        ip: req.ip,
        route: req.originalUrl,
        timestamp: new Date().toISOString(),
      });

      return res.status(400).json({
        status: 'error',
        message: 'Invalid reset token format',
        details: `Expected 64-character hex string, got ${typeof token === 'string' ? token.length : 'N/A'} characters`,
      });
    }

    // Log token details for debugging
    logger.info('Reset token received', {
      originalToken: token,
      tokenLength: token.length,
      isHex: /^[0-9a-fA-F]+$/.test(token),
    });

    // Check if passwords match
    if (password !== confirmPassword) {
      return res.status(400).json({
        status: 'error',
        message: 'Passwords do not match',
      });
    }

    // Check password strength
    const passwordCheck = checkPasswordStrength(password);
    if (!passwordCheck.isValid) {
      return res.status(400).json({
        status: 'error',
        message: 'Password does not meet requirements',
        issues: Object.values(passwordCheck.issues).filter(Boolean),
      });
    }

    const strength = zxcvbn(password);
    if (strength.score < 3) {
      return res.status(400).json({
        status: 'error',
        message: 'Password is too weak',
        suggestions: strength.feedback?.suggestions || [],
      });
    }

    // Get hashed token using the decoded token
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // Find user with valid reset token and not expired
    const user = await prisma.user.findFirst({
      where: {
        resetPasswordToken: hashedToken,
        resetPasswordExpire: { gt: new Date() },
      },
      select: { id: true, firstname: true, email: true, role: true, passwordHash: true },
    });

    if (!user) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid or expired reset token',
      });
    }

    // Check if new password is the same as the old one
    const isMatch = user.passwordHash ? await bcrypt.compare(password, user.passwordHash) : false;
    if (isMatch) {
      return res.status(400).json({
        status: 'error',
        message: 'New password cannot be the same as the old password',
      });
    }

    // Set new password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, resetPasswordToken: null, resetPasswordExpire: null },
    });

    // Send confirmation email
    try {
      await addToQueue('passwordResetConfirmation', user.email, {
        name: user.firstname,
      });
    } catch (emailError) {
      logger.error('Error sending password reset confirmation email:', {
        error: emailError.message,
        stack: emailError.stack,
        userId: user.id,
        userEmail: user.email,
      });
      // Don't fail the request if email fails
    }

    // Generate new JWT token
    const authToken = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      env.jwtSecret,
      { expiresIn: env.jwtExpire }
    );

    res.status(200).json({
      status: 'success',
      message: 'Password reset successful',
      data: {
        token: authToken,
        user: {
          id: user.id,
          firstname: user.firstname,
          middlename: user.middlename,
          lastname: user.lastname,
          email: user.email,
          role: user.role,
        },
      },
    });
  } catch (error) {
    logger.error('Reset password error:', {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({
      status: 'error',
      message: 'Internal server error',
    });
  }
};

/**
 * Request email verification (send verification link)
 * Usage: POST /api/auth/request-verification
 * Body: { email }
 */
export const requestVerification = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        status: 'error',
        message: 'Email is required',
      });
    }

    const user = await prisma.user.findUnique({
      where: { email: email?.trim().toLowerCase() },
      select: { id: true, firstname: true, email: true, isVerified: true, isDeleted: true },
    });

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found',
      });
    }
    if (user.isVerified) {
      return res.status(400).json({
        status: 'error',
        message: 'Email is already verified',
      });
    }
    if (user.isDeleted) {
      return res.status(400).json({
        status: 'error',
        message: 'User is deleted',
      });
    }

    // Generate token and hash
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    // compute expire (default to 24 hours if not configured)
    const expireMs = parseDuration(env.verificationTokenExpire, 24 * 60 * 60 * 1000);
    const expiry = new Date(Date.now() + expireMs);

    // Update user with hashed token and expiry
    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerificationToken: tokenHash,
        emailVerificationExpire: expiry,
      },
    });

    // Create verification link
    const verificationUrl = `${env.clientUrl}/verify-email/${rawToken}`;

    // Send email
    try {
      const rawExpire = env.verificationTokenExpire || 24 * 60 * 60 * 1000;
      const expireInHours = String(rawExpire).endsWith('h')
        ? `${String(rawExpire).replace('h', '')} hours`
        : String(rawExpire);

      await addToQueue('verificationEmail', user.email, {
        name: user.firstname,
        verificationLink: verificationUrl,
        expiresIn: expireInHours,
      });

      return res.status(200).json({
        status: 'success',
        message: 'Verification email sent',
      });
    } catch (emailError) {
      logger.error('Error sending verification email:', {
        error: emailError.message,
        stack: emailError.stack,
        userId: user.id,
        userEmail: user.email,
      });
      await prisma.user.update({
        where: { id: user.id },
        data: { emailVerificationToken: null, emailVerificationExpire: null },
      });

      // Don't fail the request if email fails
    }

  } catch (error) {
    logger.error('Error requesting verification:', {
      error: error.message,
      stack: error.stack,
      userEmail: req.body?.email,
    });
    return res.status(500).json({
      status: 'error',
      message: 'Internal server error',
    });
  }
};

/**
 * Verify email (user clicks link)
 * Usage: GET /api/auth/verify-email/:token
 */
export const verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;
    if (!token) {
      return res.status(400).json({
        status: 'error',
        message: 'Verification token is required',
      });
    }

    // Check if token is valid
    if (typeof token !== 'string' || token.length !== 64) {
      logger.warn('Reset token validation failed', {
        reason: 'Invalid token type',
        tokenType: typeof token,
        tokenLength: typeof token === 'string' ? token.length : 'N/A',
        ip: req.ip,
        route: req.originalUrl,
        timestamp: new Date().toISOString(),
      });

      return res.status(400).json({
        status: 'error',
        message: 'Invalid reset token format',
        details: `Expected 64-character hex string, got ${typeof token === 'string' ? token.length : 'N/A'} characters`,
      });
    }

    // Log token details for debugging
    logger.info('Reset token received', {
      originalToken: token,
      tokenLength: token.length,
      isHex: /^[0-9a-fA-F]+$/.test(token),
    });

    // Get hashed token using the decoded token
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Find user with matching hashed token and not expired
    const user = await prisma.user.findFirst({
      where: {
        emailVerificationToken: tokenHash,
        emailVerificationExpire: { gt: new Date() },
        isVerified: false,
      },
    });

    if (!user) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid or expired verification token',
      });
    }
    // Update user: set verified, clear token fields
    await prisma.user.update({
      where: { id: user.id },
      data: {
        isVerified: true,
        emailVerificationToken: null,
        emailVerificationExpire: null,
      },
    });
    return res.status(200).json({
      status: 'success',
      message: 'Email verified successfully',
    });
  } catch (error) {
    logger.error('Error verifying email:', {
      error: error.message,
      stack: error.stack,
    });
    return res.status(500).json({
      status: 'error',
      message: 'Internal server error',
    });
  }
};

import prisma from '../config/prisma.js';
import logger from '../utils/logger.js';

// Add auction to user's watchlist
export const addToWatchlist = async (req, res) => {
  try {
    const userId = req.user.id;
    const { auctionId } = req.body;

    if (!auctionId) {
      return res.status(400).json({ status: 'error', message: 'Auction ID required' });
    }

    // Check if auction exists and is active
    const auction = await prisma.auction.findUnique({
      where: {
        id: auctionId,
        isDeleted: false
      }
    });

    if (!auction) {
      return res.status(404).json({
        status: 'error',
        message: 'Auction not found'
      });
    }

    // Check if already in watchlist (including soft-deleted)
    const existing = await prisma.watchlist.findFirst({
      where: {
        userId,
        auctionId,
      },
      select: {
        id: true,
        isDeleted: true
      }
    });

    if (existing) {
      if (!existing.isDeleted) {
        return res.status(409).json({
          status: 'error',
          message: 'Auction is already in your watchlist'
        });
      }

      // Restore if previously soft-deleted
      await prisma.watchlist.update({
        where: { id: existing.id },
        data: {
          isDeleted: false,
          deletedAt: null,
          deletedById: null
        }
      });

      logger.info('Restored to watchlist', { userId, auctionId });
      return res.status(200).json({
        status: 'success',
        message: 'Auction added to watchlist'
      });
    }

    // Create new Watchlist entry
    await prisma.watchlist.create({
      data: { userId, auctionId },
    });

    logger.info('Added to watchlist', { userId, auctionId });
    return res.status(201).json({ status: 'success', message: 'Auction added to watchlist' });
  } catch (error) {
    logger.error('Add to watchlist error', { error: error.message, stack: error.stack });
    return res.status(500).json({ status: 'error', message: 'Failed to add to watchlist' });
  }
};

// Remove auction from user's watchlist
export const removeFromWatchlist = async (req, res) => {
  try {
    const userId = req.user.id;
    const { auctionId } = req.body;

    if (!auctionId) {
      return res.status(400).json({ status: 'error', message: 'Auction ID required' });
    }

    // Soft delete the watchlist entry
    const result = await prisma.watchlist.updateMany({
      where: {
        userId,
        auctionId,
        isDeleted: false
      },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedById: userId
      }
    });

    if (result.count === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Auction not found in your watchlist'
      });
    }

    logger.info('Removed from watchlist', { userId, auctionId });
    return res.status(200).json({ status: 'success', message: 'Removed from watchlist' });
  } catch (error) {
    logger.error('Remove from watchlist error', { error: error.message, stack: error.stack, userId: req.user.id, auctionId: req.body.auctionId });
    return res.status(500).json({ status: 'error', message: 'Failed to remove from watchlist' });
  }
};

// Get user's watchlist
export const getWatchlist = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [total, items] = await Promise.all([
      prisma.watchlist.count({
        where: {
          userId,
          isDeleted: false,
          auction: {
            isDeleted: false
          }
        }
      }),
      prisma.watchlist.findMany({
        where: {
          userId,
          isDeleted: false,
          auction: {
            isDeleted: false
          }
        },
        include: {
          auction: {
            select: {
              id: true,
              title: true,
              currentPrice: true,
              endDate: true,
              status: true,
              images: true
            }
          }
        },
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' }
      })
    ]);

    return res.status(200).json({
      status: 'success',
      data: {
        items,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    logger.error('Get watchlist error', {
      error: error.message,
      stack: error.stack,
      userId: req.user.id
    });
    return res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve watchlist'
    });
  }
};

// Check if auction is in user's watchlist (heart icon state)
export const checkWatchlistStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const { auctionId } = req.params;

    if (!auctionId) {
      return res.status(400).json({
        status: 'error',
        message: 'Auction ID is required'
      });
    }

    const watchlistItem = await prisma.watchlist.findFirst({
      where: {
        userId,
        auctionId,
        isDeleted: false
      },
      select: {
        id: true,
        auction: {
          select: {
            id: true,
            title: true
          }
        }
      }
    });

    return res.status(200).json({
      status: 'success',
      data: {
        isWatching: !!watchlistItem,
        auction: watchlistItem?.auction || null
      }
    });

  } catch (error) {
    logger.error('Check watchlist status error', {
      error: error.message,
      stack: error.stack,
      userId: req.user.id,
      auctionId: req.params.auctionId
    });
    return res.status(500).json({
      status: 'error',
      message: 'Failed to check watchlist status'
    });
  }
};

import { Prisma } from '@prisma/client';
import prisma from '../config/prisma.js';
import getCloudinary from '../config/cloudinary.js';
import logger from '../utils/logger.js';
import { listAuctionsPrisma } from '../repositories/auctionRepo.prisma.js';

// @desc    Create a new auction
// @route   POST /api/auctions
// @access  Private
export const createAuction = async (req, res) => {
  try {
    const {
      title,
      description,
      category,
      startingPrice,
      startDate,
      endDate,
      bidIncrement,
      images,
    } = req.body;

    const sellerId = req.user?.id?.toString();
    const createdAuction = await prisma.auction.create({
      data: {
        title,
        description,
        category,
        startingPrice: new Prisma.Decimal(startingPrice),
        currentPrice: new Prisma.Decimal(startingPrice),
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        status: 'upcoming',
        bidIncrement: new Prisma.Decimal(bidIncrement),
        images,
        sellerId,
      },
      include: {
        seller: { select: { username: true, email: true, role: true } },
      },
    });

    res.status(201).json({
      success: true,
      message: 'Auction created successfully',
      data: createdAuction,
    });
  } catch (error) {
    logger.error('Error creating auction:', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
      auctionData: req.body,
    });

    // Clean up uploaded files in case of error
    if (req.uploadedFiles?.length > 0) {
      try {
        const cloudinary = await getCloudinary();
        await Promise.all(
          req.uploadedFiles.map(file =>
            cloudinary.uploader.destroy(file.publicId).catch(err =>
              logger.error('Error destroying uploaded file:', {
                error: err.message,
                stack: err.stack,
                publicId: file.publicId,
              })
            )
          )
        );
      } catch (cleanupError) {
        logger.error('Error cleaning up uploaded files:', {
          error: cleanupError.message,
          stack: cleanupError.stack,
          files: req.uploadedFiles,
        });
      }
    }

    res.status(500).json({
      success: false,
      message: 'Server error while creating auction',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// @desc    Get all auctions
// @route   GET /api/auctions/admin
// @access  Admin
export const getAuctions = async (req, res) => {
  try {
    const {
      status,
      category,
      search,
      seller,
      winner,
      minPrice,
      maxPrice,
      startDate,
      endDate,
      endingSoon,
      fields,
      page = 1,
      limit = 10,
      sort = 'createdAt:desc',
    } = req.query;

    const role = req.user?.role || null;

    // Only admins can see soft-deleted auctions
    if ((status === 'cancelled' || status === 'all') && role !== 'admin') {
      return res.status(403).json({
        status: 'error',
        message: 'Only admins can view deleted auctions',
      });
    }

    // Use the repository to get paginated and filtered auctions
    const { auctions, count, pageNum, take } = await listAuctionsPrisma({
      status,
      category,
      search,
      seller,
      winner,
      minPrice,
      maxPrice,
      startDate,
      endDate,
      endingSoon,
      fields,
      page,
      limit,
      sort,
    });

    // Field selection
    let resultAuctions = auctions;
    if (fields) {
      const fieldList = fields.split(',').map(f => f.trim());
      resultAuctions = auctions.map(auction => {
        const filtered = {};
        fieldList.forEach(field => {
          if (auction[field] !== undefined) {
            filtered[field] = auction[field];
          }
        });
        return filtered;
      });
    }

    const totalPages = Math.ceil(count / take);
    const hasNext = pageNum < totalPages;
    const hasPrev = pageNum > 1;

    res.status(200).json({
      status: 'success',
      results: resultAuctions.length,
      pagination: {
        currentPage: pageNum,
        total: count,
        totalPages,
        hasNext,
        hasPrev,
      },
      data: {
        auctions: resultAuctions,
      },
    });
  } catch (error) {
    logger.error('Error fetching auctions:', {
      error: error.message,
      stack: error.stack,
      query: req.query,
    });
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch auctions',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// @desc    Get public auctions
// @route   GET /api/auctions
// @access  Public
export const getPublicAuctions = async (req, res, next) => {
  // If user is trying to access admin-only statuses without being an admin
  if (['cancelled', 'all'].includes(req.query.status)) {
    return res.status(401).json({
      status: 'error',
      message: 'Authentication required to view these auctions',
    });
  }

  // If no restricted status is being accessed, continue with normal auction fetching
  return getAuctions(req, res, next);
};

// @desc    Get single auction
// @route   GET /api/auctions/:id
// @access  Public
/**
export const getAuctionById = async (req, res) => {
  try {
    const auction = await prisma.auction.findUnique({
      where: { id: req.params.id },
      include: {
        seller: { select: { username: true } },
        winner: { select: { username: true } },
      },
    });

    if (auction) {
      res.json({
        status: 'success',
        data: {
          ...auction,
        },
      });
    } else {
      res.status(404).json({ message: 'Auction not found' });
    }
  } catch (error) {
    logger.error('Get auction by id error:', {
      error: error.message,
      stack: error.stack,
      auctionId: req.params.id,
    });
    res.status(500).json({ message: 'Server error' });
  }
};
*/
export const getAuctionById = async (req, res) => {
  try {
    const { auctionId } = req.params;

    const auction = await prisma.auction.findUnique({
      where: { id: auctionId },
      include: {
        seller: { select: { username: true } },
        winner: { select: { username: true } },
      },
    });

    if (auction) {
      res.json({
        status: 'success',
        data: {
          ...auction,
        },
      });
    } else {
      res.status(404).json({
        status: 'error',
        message: 'Auction not found',
      });
    }
  } catch (error) {
    logger.error('Get auction by id error:', {
      error: error.message,
      stack: error.stack,
      auctionId,
    });
    res.status(500).json({
      status: 'error',
      message: 'Server error',
    });
  }
};


// @desc    Update auction
// @route   PUT /api/auctions/:id
// @access  Private/Owner or Admin
export const updateAuction = async (req, res) => {
  try {
    const { title, description, startingPrice, startDate, endDate, images, category } = req.body;
    const { auctionId } = req.params;

    // Find the auction
    const auction = await prisma.auction.findUnique({ where: { id: auctionId } });
    if (!auction) {
      return res.status(404).json({
        success: false,
        message: 'Auction not found',
      });
    }

    // Check if user is the owner or admin
    const actorId = req.user?.id?.toString();
    if (auction.sellerId.toString() !== actorId && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this auction',
      });
    }

    // Check if auction has started
    if (new Date(auction.startDate) <= new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot update an auction that has already started',
      });
    }

    // Check if auction has ended
    if (new Date(auction.endDate) < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot update an auction that has already ended',
      });
    }

    // Update fields if provided
    const updates = {};
    if (title) updates.title = title;
    if (description) updates.description = description;
    if (startingPrice !== undefined) {
      updates.startingPrice = new Prisma.Decimal(startingPrice);
      // Update currentPrice to match the new startingPrice if it's being updated
      updates.currentPrice = new Prisma.Decimal(startingPrice);
    }
    if (startDate) updates.startDate = new Date(startDate);
    if (endDate) updates.endDate = new Date(endDate);
    if (category) updates.category = category;

    // Handle images if provided (delete old images)
    if (images && Array.isArray(images)) {
      if (auction.images && auction.images.length > 0) {
        try {
          const cloudinary = await getCloudinary();
          await Promise.all(
            auction.images.map(async img => {
              if (img.publicId) {
                await cloudinary.uploader.destroy(img.publicId);
              }
            })
          );
        } catch (error) {
          logger.error('Error deleting old images:', {
            error: error.message,
            stack: error.stack,
            auctionId,
            userId: actorId,
          });
          // Continue with the update even if image deletion fails
        }
      }
      updates.images = images;
    }

    // Add version to updates
    updates.version = { increment: 1 };

    const updatedAuction = await prisma.auction.update({
      where: {
        id: auctionId,
        version: auction.version, // Optimistic concurrency control
      },
      data: updates,
    });

    res.status(200).json({
      success: true,
      data: updatedAuction,
    });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(409).json({
        success: false,
        message: 'This auction was modified by another user. Please refresh and try again.',
      });
    }
    logger.error('Update auction error:', {
      error: error.message,
      stack: error.stack,
      errorName: error.name,
      auctionId,
      userId: req.user?.id,
    });
    res.status(500).json({
      success: false,
      message:
        error.name === 'ValidationError'
          ? Object.values(error.errors)
            .map(val => val.message)
            .join(', ')
          : 'Server error while updating auction',
    });
  }
};

// @desc    Delete auction
// @route   DELETE /api/auctions/:id
// @access  Private/Owner or Admin
export const deleteAuction = async (req, res) => {
  const { auctionId } = req.params;
  const actorId = req.user?.id?.toString();
  // Check both query params and body for the permanent flag
  //const permanent = req.query.permanent === 'false'; // || req.body.permanent === 'false'
  const { permanent = false } = req.query;

  try {
    // Find the auction
    const auction = await prisma.auction.findUnique({
      where: { id: auctionId },
      select: {
        id: true,
        sellerId: true,
        startDate: true,
        images: true,
        version: true,
      },
    });

    if (!auction) {
      return res.status(404).json({
        success: false,
        message: 'Auction not found',
      });
    }

    // Check if user is the owner or admin
    if (auction.sellerId.toString() !== actorId && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this auction',
      });
    }

    // Only admins can perform permanent deletion
    if (permanent && (!req.user || req.user.role !== 'admin')) {
      return res.status(403).json({
        success: false,
        message: 'Only admins can permanently delete auctions',
      });
    }

    // Check if auction has started (for non-admin users)
    if (new Date(auction.startDate) <= new Date() && req.user.role !== 'admin') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete an auction that has already started',
      });
    }

    if (permanent) {
      // Delete images from Cloudinary if they exist
      if (auction.images && auction.images.length > 0) {
        try {
          const cloudinary = await getCloudinary();
          await Promise.all(
            auction.images.map(async img => {
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

      // Permanently delete auction and associated bids
      await prisma.$transaction([
        prisma.bid.deleteMany({ where: { auctionId } }),
        prisma.auction.delete({
          where: {
            id: auctionId,
            version: auction.version, // Optimistic concurrency control
          },
        }),
      ]);
    } else {
      // Soft delete with version check
      const updatedAuction = await prisma.auction.update({
        where: {
          id: auctionId,
          version: auction.version, // Optimistic concurrency control
        },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
          deletedById: actorId,
          version: { increment: 1 }, // Increment version
        },
      });

      if (!updatedAuction) {
        throw new Error('Failed to soft delete auction - version mismatch');
      }
    }

    res.status(200).json({
      success: true,
      message: permanent
        ? 'Auction and all associated bids have been permanently deleted'
        : 'Auction has been soft deleted',
      data: { id: auctionId },
    });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(409).json({
        success: false,
        message: 'This auction was modified by another user. Please refresh and try again.',
      });
    }

    logger.error('Delete auction error:', {
      error: error.message,
      stack: error.stack,
      auctionId,
      userId: actorId,
      permanent,
    });
    return res.status(500).json({
      success: false,
      message: 'Error deleting auction',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

import prisma from '../config/prisma.js';
import logger from '../utils/logger.js';

// Only admin users can add/remove featured auctions
export const addFeaturedAuction = async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Admins only' });
    }
    const { auctionId } = req.body;
    const exists = await prisma.featuredAuction.findUnique({ where: { auctionId } });
    if (exists) {
      if (exists.isDeleted) {
        return res
          .status(409)
          .json({ status: 'error', message: 'Auction already featured. It is soft deleted' });
      }
      return res.status(409).json({ status: 'error', message: 'Auction already featured' });
    }
    // Only allow upcoming or active auctions to be featured
    const auction = await prisma.auction.findUnique({ where: { id: auctionId } });
    if (!auction || !['upcoming', 'active'].includes(auction.status)) {
      return res
        .status(400)
        .json({ status: 'error', message: 'Only upcoming or active auctions can be featured' });
    }
    const featured = await prisma.featuredAuction.create({
      data: {
        auctionId,
        addedById: req.user.id,
      },
    });
    logger.info('Added featured auction', { auctionId, addedBy: req.user.id });
    return res.status(201).json({ status: 'success', data: featured });
  } catch (err) {
    logger.error('Error adding featured auction', { error: err.message, stack: err.stack });
    next(err);
  }
};

export const removeFeaturedAuction = async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ status: 'error', message: 'Forbidden: Admins only' });
    }
    const { auctionId } = req.body;
    if (!auctionId) {
      return res.status(400).json({ status: 'error', message: 'Auction ID required' });
    }
    const getPermanentValue = value => {
      if (value == null) return false;
      if (typeof value === 'string') return value.toLowerCase() === 'true';
      return !!value;
    };
    // Accept permanent from query string (?permanent=true) and fallback to body for backward compatibility
    const permanent =
      getPermanentValue(req.query?.permanent) || getPermanentValue(req.body?.permanent);

    const featured = await prisma.featuredAuction.findUnique({
      where: { auctionId },
    });
    if (!featured) {
      return res.status(404).json({ status: 'error', message: 'Featured auction not found' });
    }
    if (featured.isDeleted) {
      return res.status(404).json({ status: 'error', message: 'Featured auction already deleted' });
    }
    if (permanent) {
      await prisma.featuredAuction.delete({ where: { auctionId } });
    } else {
      await prisma.featuredAuction.update({
        where: { auctionId },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
          deletedById: req.user.id,
        },
      });
    }

    logger.info('Featured auction removed', {
      auctionId,
      permanent,
      deletedById: req.user.id,
    });
    res.status(200).json({
      status: 'success',
      message: permanent
        ? 'Auction permanently removed from featured list'
        : 'Auction soft deleted from featured list',
    });
  } catch (err) {
    logger.error('Error removing featured auction', {
      error: err.message,
      stack: err.stack,
      auctionId: req.body?.auctionId,
      permanent: req.query?.permanent,
    });
    next(err);
  }
};

export const getFeaturedAuctions = async (req, res, next) => {
  try {
    const featured = await prisma.featuredAuction.findMany({
      where: { isDeleted: false },
      include: { auction: true, addedBy: { select: { id: true, username: true } } },
      orderBy: { createdAt: 'desc' },
    });
    if (!featured || featured.length === 0) {
      return res.status(200).json({ status: 'success', message: 'No featured auctions' });
    }
    return res.status(200).json({ status: 'success', data: featured });
  } catch (err) {
    logger.error('Error fetching featured auctions', { error: err.message, stack: err.stack });
    next(err);
  }
};

// Restore a soft deleted featured auction (admin only)
export const restoreFeaturedAuction = async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ status: 'error', message: 'Forbidden: Admins only' });
    }
    const { auctionId } = req.body;
    if (!auctionId) {
      return res.status(400).json({ status: 'error', message: 'Auction ID required' });
    }
    // Only allow upcoming or active auctions to be restored
    const auction = await prisma.auction.findUnique({ where: { id: auctionId } });
    if (!auction || !['upcoming', 'active'].includes(auction.status)) {
      return res
        .status(400)
        .json({ status: 'error', message: 'Only upcoming or active auctions can be restored' });
    }
    // Featured auction must exist and be soft-deleted
    const featured = await prisma.featuredAuction.findUnique({ where: { auctionId } });
    if (!featured || !featured.isDeleted) {
      return res.status(404).json({
        status: 'error',
        message: 'No soft deleted featured auction found for this auction',
      });
    }
    // Restore by setting isDeleted to false and clearing deletedAt and deletedById
    await prisma.featuredAuction.update({
      where: { auctionId },
      data: {
        isDeleted: false,
        deletedAt: null,
        deletedById: null,
      },
    });
    logger.info('Restored featured auction', { auctionId, restoredBy: req.user.id });
    return res
      .status(200)
      .json({ status: 'success', message: 'Featured auction restored', details: { auctionId } });
  } catch (err) {
    logger.error('Error restoring featured auction', { error: err.message, stack: err.stack });
    next(err);
  }
};