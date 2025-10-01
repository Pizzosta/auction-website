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
      select: { id: true, firstname: true, email: true },
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
