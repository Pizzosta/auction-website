import express from 'express';
import { register, login, forgotPassword, resetPassword } from '../controllers/authController.js';
import { refreshToken, logout, logoutAllDevices } from '../controllers/tokenController.js';
import { forgotLimiter, loginLimiter } from '../middleware/security.js';
import { validate } from '../middleware/validationMiddleware.js';
import { authSchema, tokenSchema } from '../utils/validators.js';
import { verifyRefreshToken, protect } from '../middleware/authMiddleware.js';

const router = express.Router();

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
router.post('/refresh-token', verifyRefreshToken, refreshToken);
router.post('/logout', verifyRefreshToken, logout);
router.post('/logout-all', protect, logoutAllDevices);

export default router;
