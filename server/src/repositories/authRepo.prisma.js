import prisma from '../config/prisma.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { env, validateEnv } from '../config/env.js';
import logger from '../utils/logger.js';
import { parseDuration } from '../utils/format.js';

// Validate required environment variables
const missingVars = validateEnv();
if (missingVars.length > 0) {
  logger.error(`Missing required environment variables: ${missingVars.join(', ')}`);
  process.exit(1);
}

/**
 * Create a new user with hashed password
 * @param {Object} userData - User data
 * @param {string} userData.email - User email
 * @param {string} userData.password - User password (will be hashed)
 * @param {string} [userData.firstname] - User first name
 * @param {string} [userData.middlename] - User middle name
 * @param {string} [userData.lastname] - User last name
 * @param {string} [userData.phone] - User phone number
 * @param {string} [userData.username] - Username
 * @param {string} [userData.role] - User role (default: 'user')
 * @returns {Promise<Object>} Created user object
 */
export const createUserWithPassword = async userData => {
  try {
    const hashedPassword = await bcrypt.hash(userData.password, 10);

    return prisma.user.create({
      data: {
        email: userData.email,
        passwordHash: hashedPassword,
        firstname: userData.firstname,
        middlename: userData.middlename || '',
        lastname: userData.lastname,
        phone: userData.phone,
        username: userData.username,
        role: userData.role || 'user',
        version: 1,
      },
    });
  } catch (error) {
    logger.error('Error creating user with password', {
      error: error.message,
      email: userData.email,
      stack: error.stack,
    });
    throw error;
  }
};

/**
 * Find user by credentials (email and password)
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Promise<Object|null>} User object if found and password matches, null otherwise
 */
export const findUserByCredentials = async (email, password) => {
  try {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: {
        id: true,
        email: true,
        username: true,
        profilePicture: true,
        passwordHash: true,
        role: true,
        isVerified: true,
        isDeleted: true,
        version: true,
      },
    });

    if (!user) {
      return null;
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return null;
    }

    // Remove sensitive data before returning
    const { passwordHash, ...userWithoutPassword } = user;
    return userWithoutPassword;
  } catch (error) {
    logger.error('Error finding user by credentials', {
      error: error.message,
      email: email,
      stack: error.stack,
    });
    throw error;
  }
};

/**
 * Generate and save password reset token
 * @param {string} email - User email
 * @returns {Promise<Object>} Reset token and user
 */
export const createPasswordResetToken = async email => {
  try {
    // Generate reset token and save hashed version to database
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

    // compute expire (default to 10 minutes if not configured)
    const expireAt = parseDuration(env.resetTokenExpire, 10 * 60 * 1000);
    const resetTokenExpire = new Date(Date.now() + expireAt);

    // Update user with hashed token and expiry
    const user = await prisma.user.update({
      where: { email },
      data: {
        resetPasswordToken: resetTokenHash,
        resetPasswordExpire: resetTokenExpire,
        version: { increment: 1 },
      },
      select: {
        id: true,
        email: true,
        firstname: true,
      },
    });

    return resetToken;
  } catch (error) {
    logger.error('Error creating password reset token', {
      error: error.message,
      email: email,
      stack: error.stack,
    });
    throw error;
  }
};

/**
 * Clear password reset token
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Updated user
 */
export const clearPasswordResetToken = async userId => {
  try {
    return prisma.user.update({
      where: { id: userId },
      data: {
        resetPasswordToken: null,
        resetPasswordExpire: null,
      },
    });
  } catch (error) {
    logger.error('Error clearing password reset token', {
      error: error.message,
      userId: userId,
      stack: error.stack,
    });
    throw error;
  }
};

/**
 * Clear email verification token
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Updated user
 */
export const clearEmailVerificationToken = async userId => {
  try {
    return prisma.user.update({
      where: { id: userId },
      data: {
        emailVerificationToken: null,
        emailVerificationExpire: null,
      },
    });
  } catch (error) {
    logger.error('Error clearing email verification token', {
      error: error.message,
      userId: userId,
      stack: error.stack,
    });
    throw error;
  }
};

/**
 * Reset user password using reset token
 * @param {string} token - Reset token
 * @param {string} newPassword - New password
 * @returns {Promise<Object>} Updated user
 */
export const resetUserPassword = async (token, newPassword) => {
  try {
    const resetPasswordToken = crypto.createHash('sha256').update(token).digest('hex');
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const user = await prisma.user.findFirst({
      where: {
        resetPasswordToken,
        resetPasswordExpire: { gt: new Date() },
      },
    });

    if (!user) {
      return null;
    }

    // Check if new password is the same as the old one
    const isSame = await bcrypt.compare(newPassword, user.passwordHash);
    if (isSame) {
      const err = new Error('New password cannot be the same as the old password');
      err.code = 'SAME_PASSWORD';
      throw err;
    }

    return prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: hashedPassword,
        resetPasswordToken: null,
        resetPasswordExpire: null,
        version: { increment: 1 },
      },
      select: {
        id: true,
        email: true,
        firstname: true,
        role: true,
      },
    });
  } catch (error) {
    logger.error('Error resetting user password', {
      error: error.message,
      token: token,
      stack: error.stack,
    });
    throw error;
  }
};

/**
 * Create email verification token
 * @param {string} email - User email
 * @returns {Promise<Object>} Verification token and user
 */
export const createEmailVerificationToken = async email => {
  try {
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationTokenHash = crypto
      .createHash('sha256')
      .update(verificationToken)
      .digest('hex');

    const expireAt = parseDuration(env.verificationTokenExpire, 24 * 60 * 60 * 1000);
    const verificationTokenExpire = new Date(Date.now() + expireAt);

    const user = await prisma.user.update({
      where: { email: email.toLowerCase() },
      data: {
        emailVerificationToken: verificationTokenHash,
        emailVerificationExpire: verificationTokenExpire,
        version: { increment: 1 },
      },
      select: {
        id: true,
        email: true,
        firstname: true,
      },
    });

    return verificationToken;
  } catch (error) {
    logger.error('Error creating email verification token', {
      error: error.message,
      email: email,
      stack: error.stack,
    });
    throw error;
  }
};

/**
 * Verify user email using verification token
 * @param {string} token - Verification token
 * @returns {Promise<Object>} Updated user
 */
export const verifyUserEmail = async token => {
  try {
    const verificationToken = crypto.createHash('sha256').update(token).digest('hex');

    // Find user with matching hashed token and not expired
    const user = await prisma.user.findFirst({
      where: {
        emailVerificationToken: verificationToken,
        emailVerificationExpire: { gt: new Date() },
        isVerified: false,
      },
    });

    if (!user) {
      return null;
    }

    return prisma.user.update({
      where: { id: user.id },
      data: {
        isVerified: true,
        emailVerificationToken: null,
        emailVerificationExpire: null,
        version: { increment: 1 },
      },
      select: {
        id: true,
        email: true,
        firstname: true,
        isVerified: true,
      },
    });
  } catch (error) {
    logger.error('Error verifying user email', {
      error: error.message,
      token: token,
      stack: error.stack,
    });
    throw error;
  }
};

/**
 * Update user's last active timestamp
 * @param {string} userId - User ID
 * @returns {Promise<void>}
 */
export const updateLastActiveAt = async userId => {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { lastActiveAt: new Date() },
    });
  } catch (error) {
    logger.error('Error updating user last active at', {
      error: error.message,
      userId: userId,
      stack: error.stack,
    });
    throw error;
  }
};
