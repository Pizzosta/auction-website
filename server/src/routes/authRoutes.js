import express from 'express';
import { register, login } from '../controllers/authController.js';
import { validate } from '../middleware/validationMiddleware.js';
import { authValidation } from '../utils/validators.js';

const router = express.Router();

// Public routes
router.post('/register', validate(authValidation.register), register);
router.post('/login', validate(authValidation.login), login);

export default router;
