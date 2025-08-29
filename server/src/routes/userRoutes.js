import express from 'express';
import { protect, admin } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validationMiddleware.js';
import { userSchema, idSchema, querySchema } from '../utils/validators.js';
import { deleteUser, updateUser, getMe, getAllUsers } from '../controllers/userController.js';

const router = express.Router();

// Get all users (admin only)
router.get('/', protect, admin, validate(querySchema, 'query'), getAllUsers);

// Protected routes
router.get('/me', protect, getMe);
router.delete('/:id', protect, validate(idSchema, 'params'), validate(userSchema.deleteUser, 'body'), deleteUser);
router.patch('/:id', protect, validate(idSchema, 'params'), validate(userSchema.updateUser, 'body'), updateUser);

export default router;
