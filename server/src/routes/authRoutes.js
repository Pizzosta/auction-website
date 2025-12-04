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
 * @swagger
 * tags:
 *   name: Auth
 *   description: Authentication and authorization
 */

/**
 * @swagger
 * /api/v1/auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new user account
 *     description: Create a new user with email, username, and password
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - email
 *               - password
 *               - confirmPassword
 *               - firstName
 *               - lastName
 *               - phone
 *             properties:
 *               username:
 *                 type: string
 *                 example: john_doe
 *                 description: Username (3-30 characters, alphanumeric with underscores)
 *               email:
 *                 type: string
 *                 format: email
 *                 example: john@example.com
 *               password:
 *                 type: string
 *                 example: StrongP@ss123
 *                 description: Password (min 8 characters, must include uppercase, lowercase, number, and special character)
 *               confirmPassword:
 *                 type: string
 *                 example: StrongP@ss123
 *               firstName:
 *                 type: string
 *                 example: John
 *               middlename:
 *                 type: string
 *                 nullable: true
 *                 example: Michael
 *               lastName:
 *                 type: string
 *                 example: Doe
 *               phone:
 *                 type: string
 *                 example: +233240179999
 *                 description: Phone number in valid international or local format
 *     responses:
 *       201:
 *         description: User registered successfully.
 *       400:
 *         description: Invalid input data or validation error
 *       409:
 *         description: Email or username already exists
 *       429:
 *         description: Too many registration attempts
 *       500:
 *         description: Internal server error
 */
router.post('/register', validate(authSchema.register, 'body'), register);

/**
 * @swagger
 * /api/v1/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Authenticate user
 *     description: Authenticate user with email/username and password to receive access and refresh tokens.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 example: user@example.com
 *                 description: User's email or username
 *               password:
 *                 type: string
 *                 format: password
 *                 example: StrongP@ss123
 *     responses:
 *       200:
 *         description: Authentication successful
 *       400:
 *         description: Missing or invalid credentials
 *       401:
 *         description: Invalid email/username or password
 *       403:
 *         description: Account not verified or suspended
 *       429:
 *         description: Too many login attempts
 *       500:
 *         description: Internal server error
 */
router.post('/login', loginLimiter, validate(authSchema.login, 'body'), login);

/**
 * @swagger
 * /api/v1/auth/forgot-password:
 *   post:
 *     tags: [Auth]
 *     summary: Request password reset
 *     description: Request a password reset link to be sent to the user's email.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *     responses:
 *       200:
 *         description: If the email exists, a reset link has been sent
 *       400:
 *         description: Invalid email format
 *       429:
 *         description: Too many password reset attempts
 *       500:
 *         description: Failed to send reset email
 */
router.post(
  '/forgot-password',
  forgotLimiter,
  validate(authSchema.forgotPassword, 'body'),
  forgotPassword
);

/**
 * @swagger
 * /api/v1/auth/reset-password/{token}:
 *   post:
 *     tags: [Auth]
 *     summary: Reset password
 *     description: Reset user password using a valid reset token from email.
 *     security: []
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: The reset token sent to user's email
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - password
 *               - confirmPassword
 *             properties:
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *                 example: NewP@ss123
 *               confirmPassword:
 *                 type: string
 *                 format: password
 *                 example: NewP@ss123
 *     responses:
 *       200:
 *         description: Password successfully reset
 *       400:
 *         description: Invalid or expired token or passwords do not match
 *       410:
 *         description: Token has expired or already been used
 *       500:
 *         description: Failed to update password
 */
router.post(
  '/reset-password/:token',
  validate(tokenSchema, 'params', { key: 'token' }),
  validate(authSchema.resetPassword, 'body'),
  resetPassword
);

/**
 * @swagger
 * /api/v1/auth/refresh-token:
 *   post:
 *     tags: [Auth]
 *     summary: Refresh access token
 *     description: Get a new access token using a valid refresh token
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 description: Valid refresh token
 *     responses:
 *       200:
 *         description: New tokens generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken:
 *                   type: string
 *                   description: New JWT access token (expires in 15m)
 *                 refreshToken:
 *                   type: string
 *                   description: New JWT refresh token (expires in 7d)
 *       401:
 *         description: Invalid or expired refresh token
 *       403:
 *         description: Refresh token not found or invalidated
 *       500:
 *         description: Failed to generate new tokens
 */
router.post('/refresh-token', verifyRefreshToken, refreshToken);

/**
 * @swagger
 * /api/v1/auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Log out current session
 *     description: Log out the current user and invalidate the refresh token
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 description: The refresh token to invalidate
 *     responses:
 *       200:
 *         description: Successfully logged out
 *       401:
 *         description: Invalid or missing refresh token
 *       500:
 *         description: Failed to process logout
 */
router.post('/logout', verifyRefreshToken, logout);

/**
 * @swagger
 * /api/v1/auth/logout-all:
 *   post:
 *     tags: [Auth]
 *     summary: Log out from all devices
 *     description: Invalidate all refresh tokens for the authenticated user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully logged out from all devices
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Failed to process logout
 */
router.post('/logout-all', protect, logoutAllDevices);

/**
 * @swagger
 * /api/v1/auth/request-verification:
 *   post:
 *     tags: [Auth]
 *     summary: Request email verification
 *     description: Request a new email verification link
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *     responses:
 *       200:
 *         description: Verification email sent successfully
 *       400:
 *         description: Invalid email or already verified
 *       401:
 *         description: Unauthorized
 *       429:
 *         description: Too many verification requests
 *       500:
 *         description: Failed to send verification email
 */
router.post(
  '/request-verification',
  protect,
  verificationEmailLimiter,
  validate(authSchema.verifyEmail, 'body'),
  requestVerification
);

/**
 * @swagger
 * /api/v1/auth/verify-email/{token}:
 *   get:
 *     tags: [Auth]
 *     summary: Verify email
 *     description: Verify user's email using the verification token
 *     security: []
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: The verification token sent to user's email
 *     responses:
 *       200:
 *         description: Email verified successfully
 *       400:
 *         description: Invalid or expired verification token
 *       410:
 *         description: Token has expired or already been used
 *       500:
 *         description: Failed to verify email
 */
router.get('/verify-email/:token', validate(tokenSchema, 'params', { key: 'token' }), verifyEmail);

export default router;
