import zxcvbn from 'zxcvbn';
import { addToQueue } from '../services/emailQueue.js';
import logger from '../utils/logger.js';
import { env, validateEnv } from '../config/env.js';
import { generateAccessToken, generateRefreshToken } from '../services/tokenService.js';
import { checkPasswordStrength, normalizeToE164 } from '../utils/format.js';
import jwt from 'jsonwebtoken';
import { findUserByEmailPrisma, findUserByUsernamePrisma, findUserByPhonePrisma } from '../repositories/userRepo.prisma.js';
import { createUserWithPassword, findUserByCredentials, updateLastActiveAt, createPasswordResetToken, clearPasswordResetToken, resetUserPassword, createEmailVerificationToken, clearEmailVerificationToken, verifyUserEmail } from '../repositories/authRepo.prisma.js';

// Validate required environment variables
const missingVars = validateEnv();
if (missingVars.length > 0) {
  logger.error(`Missing required environment variables: ${missingVars.join(', ')}`);
  process.exit(1);
}

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
    const userByEmail = await findUserByEmailPrisma(normalizedEmail, ['id', 'isDeleted']);
    if (userByEmail && !userByEmail.isDeleted) {
      return res.status(400).json({
        status: 'error',
        message: 'Email is already in use by another user.',
      });
    }
    if (userByEmail && userByEmail.isDeleted) {
      return res.status(400).json({
        status: 'error',
        message: 'This email was previously used by another account',
      })
    }

    const userByUsername = await findUserByUsernamePrisma(normalizedUsername, ['id', 'isDeleted']);
    if (userByUsername && !userByUsername.isDeleted) {
      return res.status(400).json({
        status: 'error',
        message: 'Username is already in use by another user.',
      });
    }
    if (userByUsername && userByUsername.isDeleted) {
      return res.status(400).json({
        status: 'error',
        message: 'This username was previously used by another account',
      })
    }

    const userByPhone = await findUserByPhonePrisma(normalizedPhone, ['id', 'isDeleted']);
    if (userByPhone && !userByPhone.isDeleted) {
      return res.status(400).json({
        status: 'error',
        message: 'Phone number is already in use by another user.',
      });
    }
    if (userByPhone && userByPhone.isDeleted) {
      return res.status(400).json({
        status: 'error',
        message: 'This phone number was previously used by another account',
      })
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
  } catch (error) {
    logger.error('Registration error:', {
      error: error.message,
      stack: error.stack,
      email: req.body?.email,
    });
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if user exists
    const user = await findUserByCredentials(email, password);
    if (!user) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid credentials'
      });
    }

    // Check if user is soft-deleted
    if (user.isDeleted) {
      return res.status(403).json({
        status: 'error',
        message: 'User account has been deactivated'
      });
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
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
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

    const normalizedEmail = email.trim().toLowerCase();

    // Find user by email
    const user = await findUserByEmailPrisma(normalizedEmail, ['id', 'firstname', 'email']);

    // Don't reveal if user doesn't exist (security best practice)
    if (!user) {
      return res.status(200).json({
        status: 'success',
        message: 'If an account with that email exists, a password reset link has been sent.',
      });
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

    // Reset password using repository
    const user = await resetUserPassword(token, password);

    if (!user) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid or expired reset token',
      });
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
      return res.status(400).json({
        status: 'error',
        message: error.message
      });
    };
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

    const normalizedEmail = email.trim().toLowerCase();

    // Find user using repository
    const user = await findUserByEmailPrisma(normalizedEmail, [
      'id', 'firstname', 'email', 'isVerified', 'isDeleted'
    ]);

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

    // Verify email using repository
    const user = await verifyUserEmail(token);

    if (!user) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid or expired verification token',
      });
    }

    return res.status(200).json({
      status: 'success',
      message: 'Email verified successfully',
      data: {
        user: {
          id: user.id,
          email: user.email,
          isVerified: user.isVerified,
        }
      }
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
