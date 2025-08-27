import express from 'express';
import { register, login, getProfile } from '../controllers/authController.js';
import { protect } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validationMiddleware.js';
import { authValidation } from '../utils/validators.js';

const router = express.Router();

// Public routes
router.post('/register', validate(authValidation.register), register);
router.post('/login', validate(authValidation.login), login);

// Protected routes
router.get('/profile', protect, getProfile);

export default router;
