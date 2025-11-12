import express from 'express';
import {
  register,
  login,
  forgotPassword,
  resetPassword,
  verifyEmail,
  requestVerification,
} from '../controllers/authController.js';
import { refreshToken, logout, logoutAllDevices } from '../controllers/tokenController.js';
import { forgotLimiter, loginLimiter, verificationEmailLimiter } from '../middleware/security.js';
import { validate } from '../middleware/validationMiddleware.js';
import { authSchema, tokenSchema } from '../utils/validators.js';
import { verifyRefreshToken, protect } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * @route POST /api/auth/register
 * @group Authentication - User Registration & Login
 * @description Register a new user account with email, username, and password.
 * @param {string} username.formData.required - Username (3-30 characters, alphanumeric with underscores)
 * @param {string} email.formData.required - Valid email address
 * @param {string} password.formData.required - Password (min 8 characters, must include uppercase, lowercase, number, and special character)
 * @param {string} confirmPassword.formData.required - Must match password
 * @param {string} firstName.formData.required - User's first name (2-50 characters)
 * @param {string} middlename.formData.optional - User's middle name (2-50 characters)
 * @param {string} lastName.formData.required - User's last name (2-50 characters)
 * @param {string} phone.formData.required - User's phone number (valid international format)
 * @returns {object} 201 - User registered successfully. Check email for verification.
 * @returns {Error} 400 - Invalid input data or validation error
 * @returns {Error} 409 - Email or username already exists
 * @returns {Error} 429 - Too many registration attempts
 * @returns {Error} 500 - Internal server error
 */
router.post('/register', validate(authSchema.register, 'body'), register);

/**
 * @route POST /api/auth/login
 * @group Authentication - User Registration & Login
 * @description Authenticate user with email/username and password to receive access and refresh tokens.
 * @param {string} email.formData.required - User's email or username
 * @param {string} password.formData.required - User's password
 * @returns {object} 200 - Authentication successful
 * @property {string} accessToken - JWT access token (expires in 15m)
 * @property {string} refreshToken - JWT refresh token (expires in 7d)
 * @property {object} user - User profile information
 * @returns {Error} 400 - Missing or invalid credentials
 * @returns {Error} 401 - Invalid email/username or password
 * @returns {Error} 403 - Account not verified or suspended
 * @returns {Error} 429 - Too many login attempts
 * @returns {Error} 500 - Internal server error
 */
router.post('/login', loginLimiter, validate(authSchema.login, 'body'), login);

/**
 * @route POST /api/auth/forgot-password
 * @group Authentication - Password Management
 * @description Request a password reset link to be sent to the user's email.
 * @param {string} email.formData.required - The email address associated with the account
 * @returns {object} 200 - If the email exists, a reset link has been sent (for security, we don't reveal if the email exists)
 * @returns {Error} 400 - Invalid email format
 * @returns {Error} 429 - Too many password reset attempts
 * @returns {Error} 500 - Failed to send reset email
 */
router.post(
  '/forgot-password',
  forgotLimiter,
  validate(authSchema.forgotPassword, 'body'),
  forgotPassword
);

/**
 * @route POST /api/auth/reset-password/{token}
 * @group Authentication - Password Management
 * @description Reset user password using a valid reset token from email.
 * @param {string} token.path.required - The reset token sent to user's email
 * @param {string} password.formData.required - New password (min 8 characters, must include uppercase, lowercase, number, and special character)
 * @param {string} confirmPassword.formData.required - Must match the new password
 * @returns {object} 200 - Password successfully reset
 * @returns {Error} 400 - Invalid or expired token
 * @returns {Error} 400 - Passwords do not match
 * @returns {Error} 410 - Token has expired or already been used
 * @returns {Error} 500 - Failed to update password
 */
router.post(
  '/reset-password/:token',
  validate(tokenSchema, 'params', { key: 'token' }),
  validate(authSchema.resetPassword, 'body'),
  resetPassword
);

/**
 * @route POST /api/auth/refresh-token
 * @group Authentication - Token Management
 * @description Get a new access token using a valid refresh token.
 * @header {string} Authorization - Bearer token (refresh token)
 * @returns {object} 200 - New tokens generated successfully
 * @property {string} accessToken - New JWT access token (expires in 15m)
 * @property {string} refreshToken - New JWT refresh token (expires in 7d)
 * @returns {Error} 401 - Invalid or expired refresh token
 * @returns {Error} 403 - Refresh token not found or invalidated
 * @returns {Error} 500 - Failed to generate new tokens
 */
router.post('/refresh-token', verifyRefreshToken, refreshToken);

/**
 * @route POST /api/auth/logout
 * @group Authentication - Token Management
 * @description Log out the current user and invalidate the refresh token.
 * @header {string} Authorization - Bearer token (refresh token)
 * @returns {object} 200 - Successfully logged out
 * @returns {Error} 401 - Invalid or missing refresh token
 * @returns {Error} 500 - Failed to process logout
 */

/**
 * @route POST /api/auth/logout-all
 * @group Authentication - Token Management
 * @description Log out from all devices by invalidating all refresh tokens for the user.
 * @header {string} Authorization - Bearer token (access token)
 * @returns {object} 200 - Successfully logged out from all devices
 * @returns {Error} 401 - Unauthorized
 * @returns {Error} 500 - Failed to process logout
 */
router.post('/logout', verifyRefreshToken, logout);
router.post('/logout-all', protect, logoutAllDevices);

/**
 * @route POST /api/auth/request-verification
 * @group Authentication - Email Verification
 * @description Request a new email verification link to be sent to the user's email.
 * @header {string} Authorization - Bearer token (access token)
 * @param {string} email.formData.required - The email address to verify
 * @returns {object} 200 - Verification email sent successfully
 * @returns {Error} 400 - Invalid email or already verified
 * @returns {Error} 401 - Unauthorized
 * @returns {Error} 429 - Too many verification requests
 * @returns {Error} 500 - Failed to send verification email
 *
 * @route GET /api/auth/verify-email/{token}
 * @group Authentication - Email Verification
 * @description Verify user's email using the verification token.
 * @param {string} token.path.required - The verification token sent to user's email
 * @returns {object} 200 - Email verified successfully
 * @returns {Error} 400 - Invalid or expired verification token
 * @returns {Error} 410 - Token has expired or already been used
 * @returns {Error} 500 - Failed to verify email
 */
router.post(
  '/request-verification',
  protect,
  verificationEmailLimiter,
  validate(authSchema.verifyEmail, 'body'),
  requestVerification
);

/**
 * @route GET /api/auth/verify-email/:token
 * @group Auth - authentication
 * @description Verify user's email address with token.
 * @param {string} token.path.required - Verification token
 * @returns {object} 200 - OK
 * @returns {Error} default - Unexpected error
 */
router.get('/verify-email/:token', validate(tokenSchema, 'params', { key: 'token' }), verifyEmail);

export default router;
