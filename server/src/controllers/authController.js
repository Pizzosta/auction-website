import zxcvbn from 'zxcvbn';
import { addToQueue } from '../services/emailQueueService.js';
import logger from '../utils/logger.js';
import { env, validateEnv } from '../config/env.js';
import { generateAccessToken, generateRefreshToken } from '../services/tokenService.js';
import { checkPasswordStrength, normalizeToE164 } from '../utils/format.js';
import jwt from 'jsonwebtoken';
import {
  findUserByEmailPrisma,
  findUserByUsernamePrisma,
  findUserByPhonePrisma,
} from '../repositories/userRepo.prisma.js';
import {
  createUserWithPassword,
  findUserByCredentials,
  updateLastActiveAt,
  createPasswordResetToken,
  clearPasswordResetToken,
  resetUserPassword,
  createEmailVerificationToken,
  clearEmailVerificationToken,
  verifyUserEmail,
} from '../repositories/authRepo.prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import cacheService from '../services/cacheService.js';

// Validate required environment variables
const missingVars = validateEnv();
if (missingVars.length > 0) {
  logger.error(`Missing required environment variables: ${missingVars.join(', ')}`);
  process.exit(1);
}

export const register = async (req, res, next) => {
  try {
    const { firstname, middlename, lastname, phone, username, email, password, confirmPassword } =
      req.body;

    // Check password match
    if (password !== confirmPassword) {
      throw new AppError('PASSWORDS_DO_NOT_MATCH', 'Passwords do not match', 400);
    }

    // Check password strength
    const passwordCheck = checkPasswordStrength(password);
    if (!passwordCheck.isValid) {
      throw new AppError(
        'PASSWORD_DOES_NOT_MEET_REQUIREMENTS',
        'Password does not meet requirements',
        400,
        { issues: Object.values(passwordCheck.issues).filter(Boolean) }
      );
    }

    const strength = zxcvbn(password);
    if (strength.score < 3) {
      throw new AppError('PASSWORD_IS_TOO_WEAK', 'Password is too weak', 400, {
        suggestions: strength.feedback?.suggestions || [],
      });
    }

    const normalizedEmail = email?.trim().toLowerCase();
    const normalizedUsername = username?.trim();
    const normalizedPhone = normalizeToE164(phone?.trim());

    if (!normalizedPhone) {
      throw new AppError('INVALID_PHONE_NUMBER_FORMAT', 'Invalid phone number format', 400);
    }

    // Check if user exists
    const userByEmail = await findUserByEmailPrisma(normalizedEmail, ['id', 'isDeleted']);
    if (userByEmail && !userByEmail.isDeleted) {
      throw new AppError('EMAIL_ALREADY_IN_USE', 'Email is already in use by another user.', 400);
    }
    if (userByEmail && userByEmail.isDeleted) {
      throw new AppError(
        'EMAIL_PREVIOUSLY_USED',
        'This email was previously used by another account',
        400
      );
    }

    const userByUsername = await findUserByUsernamePrisma(normalizedUsername, ['id', 'isDeleted']);
    if (userByUsername && !userByUsername.isDeleted) {
      throw new AppError(
        'USERNAME_ALREADY_IN_USE',
        'Username is already in use by another user.',
        400
      );
    }
    if (userByUsername && userByUsername.isDeleted) {
      throw new AppError(
        'USERNAME_PREVIOUSLY_USED',
        'This username was previously used by another account',
        400
      );
    }

    const userByPhone = await findUserByPhonePrisma(normalizedPhone, ['id', 'isDeleted']);
    if (userByPhone && !userByPhone.isDeleted) {
      throw new AppError(
        'PHONE_NUMBER_ALREADY_IN_USE',
        'Phone number is already in use by another user.',
        400
      );
    }
    if (userByPhone && userByPhone.isDeleted) {
      throw new AppError(
        'PHONE_NUMBER_PREVIOUSLY_USED',
        'This phone number was previously used by another account',
        400
      );
    }

    // Create user (hash password)
    const user = await createUserWithPassword({
      firstname,
      middlename: middlename || '',
      lastname,
      phone: normalizedPhone,
      username: normalizedUsername,
      email: normalizedEmail,
      password,
      role: 'user',
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

    // Invalidate users list cache after registration
    try {
      await cacheService.delByPrefix('GET:/api/v1/users');
      await cacheService.delByPrefix(`GET:/api/v1/users/${user.id}`);
    } catch (err) {
      logger.warn('Cache invalidation failed after register', { error: err?.message });
    }
  } catch (error) {
    logger.error('Registration error:', {
      error: error.message,
      stack: error.stack,
      email: req.body?.email,
    });
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Check if user exists
    const user = await findUserByCredentials(email, password);
    if (!user) {
      throw new AppError('INVALID_CREDENTIALS', 'Invalid User credentials', 400);
    }

    // Check if user is soft-deleted
    if (user.isDeleted) {
      throw new AppError('USER_DEACTIVATED', 'User account has been deactivated', 403);
    }

    // Update lastActiveAt timestamp
    await updateLastActiveAt(user.id);

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
          username: user.username,
          email: user.email,
          profilePicture: user.profilePicture || null,
          role: user.role,
        },
        accessToken,
        expiresIn: env.accessTokenExpiry,
      },
    });
  } catch (error) {
    logger.error('Login error:', error);
    next(error);
  }
};

export const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      throw new AppError('EMAIL_REQUIRED', 'Email is required', 400);
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Find user by email
    const user = await findUserByEmailPrisma(normalizedEmail, ['id', 'firstname', 'email']);

    // Don't reveal if user doesn't exist (security best practice)
    if (!user) {
      throw new AppError(
        'USER_NOT_FOUND',
        'If an account with that email exists, a password reset link has been sent.',
        404
      );
    }

    // Generate reset token and save hashed version to database
    const resetToken = await createPasswordResetToken(normalizedEmail);

    // Create reset URL - use the unhashed token in the URL
    const resetUrl = `${env.clientUrl}/reset-password/${resetToken}`;

    // Send email
    try {
      const rawExpire = env.resetTokenExpire || '10m';
      const expireInMinutes = rawExpire.endsWith('m')
        ? `${rawExpire.replace('m', '')} minutes`
        : rawExpire;

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
      await clearPasswordResetToken(user.id);

      // Don't fail the request if email fails
    }
  } catch (error) {
    logger.error('Forgot password error:', {
      error: error.message,
      stack: error.stack,
      userEmail: req.body?.email,
    });
    next(error);
  }
};

export const resetPassword = async (req, res, next) => {
  try {
    const { token } = req.params;
    const { password, confirmPassword } = req.body;

    if (!token) {
      throw new AppError('TOKEN_REQUIRED', 'Verification token is required', 400);
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

      return next(
        new AppError('INVALID_RESET_TOKEN', 'Invalid reset token format', 400, {
          expected: '64-character hex string',
          received: typeof token === 'string' ? token.length : 'N/A',
        })
      );
    }

    // Log token details for debugging
    logger.info('Reset token received', {
      originalToken: token,
      tokenLength: token.length,
      isHex: /^[0-9a-fA-F]+$/.test(token),
    });

    // Check if passwords match
    if (password !== confirmPassword) {
      throw new AppError('PASSWORDS_DO_NOT_MATCH', 'Passwords do not match', 400);
    }

    // Check password strength
    const passwordCheck = checkPasswordStrength(password);
    if (!passwordCheck.isValid) {
      throw new AppError(
        'PASSWORD_DOES_NOT_MEET_REQUIREMENTS',
        'Password does not meet requirements',
        400,
        { issues: Object.values(passwordCheck.issues).filter(Boolean) }
      );
    }

    const strength = zxcvbn(password);
    if (strength.score < 3) {
      throw new AppError('PASSWORD_IS_TOO_WEAK', 'Password is too weak', 400, {
        suggestions: strength.feedback?.suggestions || [],
      });
    }

    // Reset password using repository
    const user = await resetUserPassword(token, password);

    if (!user) {
      throw new AppError('INVALID_OR_EXPIRED_RESET_TOKEN', 'Invalid or expired reset token', 400);
    }

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

    // Invalidate user caches after password reset
    try {
      await cacheService.delByPrefix('GET:/api/v1/users');
      await cacheService.delByPrefix(`GET:/api/v1/users/${user.id}`);
    } catch (err) {
      logger.warn('Cache invalidation failed after resetPassword', { error: err?.message });
    }

    res.status(200).json({
      status: 'success',
      message: 'Password reset successful',
      data: {
        accessToken: authToken,
        expiresIn: env.jwtExpire,
        user: {
          id: user.id,
          firstname: user.firstname,
          email: user.email,
          role: user.role,
        },
      },
    });
  } catch (error) {
    if (error.code === 'SAME_PASSWORD') {
      throw new AppError('SAME_PASSWORD', 'New password must be different from old password', 400);
    }
    logger.error('Reset password error:', {
      error: error.message,
      stack: error.stack,
    });
    next(error);
  }
};

/**
 * Request email verification (send verification link)
 * Usage: POST /api/auth/request-verification
 * Body: { email }
 */
export const requestVerification = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      throw new AppError('EMAIL_REQUIRED', 'Email is required', 400);
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Find user using repository
    const user = await findUserByEmailPrisma(normalizedEmail, [
      'id',
      'firstname',
      'email',
      'isVerified',
      'isDeleted',
    ]);

    if (!user) {
      throw new AppError('USER_NOT_FOUND', 'User not found', 404);
    }
    if (user.isVerified) {
      throw new AppError('EMAIL_ALREADY_VERIFIED', 'Email is already verified', 400);
    }
    if (user.isDeleted) {
      throw new AppError('USER_DELETED', 'User is deleted', 400);
    }

    // Generate verification token using repository
    const verificationToken = await createEmailVerificationToken(normalizedEmail);

    // Create verification link
    const verificationUrl = `${env.clientUrl}/verify-email/${verificationToken}`;

    // Send email
    try {
      const rawExpire = env.verificationTokenExpire || '24h';
      const expireInHours = rawExpire.endsWith('h')
        ? `${rawExpire.replace('h', '')} hours`
        : rawExpire;

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
      await clearEmailVerificationToken(user.id);

      // Don't fail the request if email fails
    }
  } catch (error) {
    logger.error('Error requesting verification:', {
      error: error.message,
      stack: error.stack,
      userEmail: req.body?.email,
    });
    next(error);
  }
};

/**
 * Verify email (user clicks link)
 * Usage: GET /api/auth/verify-email/:token
 */
export const verifyEmail = async (req, res, next) => {
  try {
    const { token } = req.params;
    if (!token) {
      throw new AppError('TOKEN_REQUIRED', 'Verification token is required', 400);
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

      throw new AppError('INVALID_RESET_TOKEN', 'Invalid reset token format', 400, {
        expected: '64-character hex string',
        received: typeof token === 'string' ? token.length : 'N/A',
      });
    }

    // Log token details for debugging
    logger.info('Reset token received', {
      originalToken: token,
      tokenLength: token.length,
      isHex: /^[0-9a-fA-F]+$/.test(token),
    });

    // Verify email using repository
    const user = await verifyUserEmail(token);

    if (!user) {
      throw new AppError(
        'INVALID_OR_EXPIRED_VERIFICATION_TOKEN',
        'Invalid or expired verification token',
        400
      );
    }

    // Invalidate user caches after email verification
    try {
      await cacheService.delByPrefix('GET:/api/v1/users');
      await cacheService.delByPrefix(`GET:/api/v1/users/${user.id}`);
    } catch (err) {
      logger.warn('Cache invalidation failed after verifyEmail', { error: err?.message });
    }

    return res.status(200).json({
      status: 'success',
      message: 'Email verified successfully',
      data: {
        user: {
          id: user.id,
          email: user.email,
          isVerified: user.isVerified,
        },
      },
    });
  } catch (error) {
    logger.error('Error verifying email:', {
      error: error.message,
      stack: error.stack,
    });
    next(error);
  }
};
