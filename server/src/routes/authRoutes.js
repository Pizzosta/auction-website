import express from 'express';
import { register, login, forgotPassword, resetPassword } from '../controllers/authController.js';
import { validate } from '../middleware/validationMiddleware.js';
import { authSchema, tokenSchema } from '../utils/validators.js';

const router = express.Router();

// Public routes
router.post('/register', validate(authSchema.register, 'body'), register);
router.post('/login', validate(authSchema.login, 'body'), login);

// Password reset routes
router.post('/forgot-password', validate(authSchema.forgotPassword, 'body'), forgotPassword);
router.post('/reset-password/:token', validate(tokenSchema, 'params'), validate(authSchema.resetPassword, 'body'), resetPassword);

export default router;
