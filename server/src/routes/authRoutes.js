import express from 'express';
import { register, login, forgotPassword, resetPassword } from '../controllers/authController.js';
import { refreshToken, logout, logoutAllDevices } from '../controllers/tokenController.js';
import { forgotLimiter, loginLimiter } from '../middleware/security.js';
import { validate } from '../middleware/validationMiddleware.js';
import { authSchema, tokenSchema } from '../utils/validators.js';
import { verifyRefreshToken, protect } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * @route POST /api/auth/register
 * @group Auth - authentication
 * @description Register a new user account.
 * @param {RegisterUser.model} body.body.required
 * @returns {object} 201 - Created
 * @returns {Error}  default - Unexpected error
 */
router.post(
  '/register',
  validate(authSchema.register, 'body'),
  register
);

/**
 * @route POST /api/auth/login
 * @group Auth - authentication
 * @description Log in with email and password to receive authentication tokens.
 * @param {LoginUser.model} body.body.required
 * @returns {object} 200 - OK
 * @returns {Error}  default - Unexpected error
 */
router.post(
  '/login',
  loginLimiter,
  validate(authSchema.login, 'body'),
  login
);

/**
 * @route POST /api/auth/forgot-password
 * @group Auth - authentication
 * @description Request a password reset link by email.
 * @param {ForgotPassword.model} body.body.required
 * @returns {object} 200 - OK
 * @returns {Error}  default - Unexpected error
 */
router.post(
  '/forgot-password',
  forgotLimiter,
  validate(authSchema.forgotPassword, 'body'),
  forgotPassword
);

/**
 * @route POST /api/auth/reset-password/{token}
 * @group Auth - authentication
 * @description Reset password using a valid reset token.
 * @param {string} token.path.required
 * @param {ResetPassword.model} body.body.required
 * @returns {object} 200 - OK
 * @returns {Error}  default - Unexpected error
 */
router.post(
  '/reset-password/:token',
  validate(tokenSchema, 'params', { key: 'token' }),
  validate(authSchema.resetPassword, 'body'),
  resetPassword
);

/**
 * @route POST /api/auth/refresh-token
 * @group Auth - authentication
 * @description Refresh authentication tokens using a valid refresh token.
 * @returns {object} 200 - OK
 * @returns {Error}  default - Unexpected error
 */
router.post(
  '/refresh-token',
  verifyRefreshToken,
  refreshToken
);

/**
 * @route POST /api/auth/logout
 * @group Auth - authentication
 * @description Log out the current user and invalidate the refresh token.
 * @returns {object} 200 - OK
 * @returns {Error}  default - Unexpected error
 */
router.post(
  '/logout',
  verifyRefreshToken,
  logout
);
router.post('/logout-all', protect, logoutAllDevices);

export default router;
