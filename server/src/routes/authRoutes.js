import express from 'express';
import { register, login, forgotPassword, resetPassword } from '../controllers/authController.js';
import { validate } from '../middleware/validationMiddleware.js';
import { authValidation } from '../utils/validators.js';

const router = express.Router();

// Public routes
router.post('/register', validate(authValidation.register, 'body'), register);
router.post('/login', validate(authValidation.login, 'body'), login);

// Password reset routes
router.post('/forgot-password', validate(authValidation.forgotPassword, 'body'), forgotPassword);
router.post('/reset-password/:token', validate(authValidation.resetPassword, 'body'), resetPassword);

export default router;
