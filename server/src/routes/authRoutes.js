import express from 'express';
import { register, login, forgotPassword, resetPassword } from '../controllers/authController.js';
import { refreshToken, logout, logoutAllDevices } from '../controllers/tokenController.js';
import { forgotLimiter, loginLimiter } from '../middleware/security.js';
import { validate } from '../middleware/validationMiddleware.js';
import { authSchema, tokenSchema } from '../utils/validators.js';
import { verifyRefreshToken, protect } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Authentication and user management
 */

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterUser'
 *     responses:
 *       201:
 *         description: User registered successfully
 *       400:
 *         description: Validation error
 */

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login a user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginUser'
 *     responses:
 *       200:
 *         description: Login successful
 *       400:
 *         description: Invalid credentials
 */

/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     summary: Request password reset
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ForgotPassword'
 *     responses:
 *       200:
 *         description: Password reset email sent
 *       400:
 *         description: Validation error
 */

/**
 * @swagger
 * /api/auth/reset-password/{token}:
 *   post:
 *     summary: Reset password
 *     tags: [Auth]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Reset token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ResetPassword'
 *     responses:
 *       200:
 *         description: Password reset successful
 *       400:
 *         description: Invalid token or password
 */

/**
 * @swagger
 * /api/auth/refresh-token:
 *   post:
 *     summary: Refresh access token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RefreshToken'
 *     responses:
 *       200:
 *         description: Token refreshed
 *       400:
 *         description: Invalid refresh token
 */

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Logout user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RefreshToken'
 *     responses:
 *       200:
 *         description: Logout successful
 *       400:
 *         description: Invalid refresh token
 */

/**
 * @swagger
 * /api/auth/logout-all:
 *   post:
 *     summary: Logout from all devices
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Logout from all devices successful
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     RegisterUser:
 *       type: object
 *       required:
 *         - firstname
 *         - lastname
 *         - phone
 *         - username
 *         - email
 *         - password
 *         - confirmPassword
 *       properties:
 *         firstname:
 *           type: string
 *           example: John
 *         lastname:
 *           type: string
 *           example: Doe
 *         middlename:
 *           type: string
 *           example: Kwame
 *         phone:
 *           type: string
 *           example: "+233500000666"
 *         username:
 *           type: string
 *           example: johndoe
 *         email:
 *           type: string
 *           example: johndoe@example.com
 *         password:
 *           type: string
 *           example: "StrongPassword123!"
 *         confirmPassword:
 *           type: string
 *           example: "StrongPassword123!"
 *     LoginUser:
 *       type: object
 *       required:
 *         - email
 *         - password
 *       properties:
 *         email:
 *           type: string
 *           example: johndoe@example.com
 *         password:
 *           type: string
 *           example: "StrongPassword123!"
 *     ForgotPassword:
 *       type: object
 *       required:
 *         - email
 *       properties:
 *         email:
 *           type: string
 *           example: johndoe@example.com
 *     ResetPassword:
 *       type: object
 *       required:
 *         - password
 *         - confirmPassword
 *       properties:
 *         password:
 *           type: string
 *           example: "NewStrongPassword123!"
 *         confirmPassword:
 *           type: string
 *           example: "NewStrongPassword123!"
 *     RefreshToken:
 *       type: object
 *       required:
 *         - refreshToken
 *       properties:
 *         refreshToken:
 *           type: string
 *           example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 */

// Public routes
router.post(
  '/register',
  validate(authSchema.register, 'body'),
  register
);

router.post(
  '/login',
  loginLimiter,
  validate(authSchema.login, 'body'),
  login
);

// Password reset routes
router.post(
  '/forgot-password',
  forgotLimiter,
  validate(authSchema.forgotPassword, 'body'),
  forgotPassword
);

router.post(
  '/reset-password/:token',
  validate(tokenSchema, 'params', { key: 'token' }),
  validate(authSchema.resetPassword, 'body'),
  resetPassword
);

// Token management routes
router.post(
  '/refresh-token',
  verifyRefreshToken,
  refreshToken
);
router.post(
  '/logout',
  verifyRefreshToken,
  logout
);
router.post('/logout-all', protect, logoutAllDevices);

export default router;
