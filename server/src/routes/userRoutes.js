import express from 'express';
import { protect, admin } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validationMiddleware.js';
import { userValidation } from '../utils/validators.js';
import { deleteUser, updateUser, getMe, getAllUsers } from '../controllers/userController.js';

const router = express.Router();

// Get all users (admin only)
router.get('/', protect, admin, getAllUsers);

// Get current user profile
router.get('/me', protect, getMe);

// Delete user
router.delete('/:id', protect, validate(userValidation.deleteUser, 'params'), deleteUser);

// Update user
router.patch('/:id', protect, validate(userValidation.updateUser, 'params'), updateUser);

export default router;
