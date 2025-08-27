import express from 'express';
import { protect, admin } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validationMiddleware.js';
import { userValidation, paramId } from '../utils/validators.js';
import { deleteUser, updateUser, getMe, getAllUsers } from '../controllers/userController.js';

const router = express.Router();

// Get all users (admin only)
router.get('/', protect, admin, getAllUsers);

// Protected routes
router.get('/me', protect, getMe);
router.delete('/:id', protect, validate(paramId, 'params'), validate(userValidation.deleteUser, 'body'), deleteUser);
router.patch('/:id', protect, validate(paramId, 'params'), validate(userValidation.updateUser, 'body'), updateUser);

export default router;
