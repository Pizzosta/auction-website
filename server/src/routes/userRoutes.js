import express from 'express';
import { protect, admin } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validationMiddleware.js';
import { userSchema, idSchema, userQuerySchema } from '../utils/validators.js';
import { 
    deleteUser, 
    updateUser, 
    getMe, 
    getAllUsers, 
    uploadProfilePicture,
    deleteProfilePicture 
} from '../controllers/userController.js';
import { uploadProfileImageMiddleware } from '../middleware/uploadMiddleware.js';

const router = express.Router();

// Get all users (admin only)
router.get(
  '/', 
  protect, 
  admin, 
  validate(userQuerySchema, 'query'), 
  getAllUsers
);

// Protected routes
router.get('/me', protect, getMe);

router.delete(
  '/:id', 
  protect, 
  validate(idSchema, 'params', { key: 'id' }), 
  validate(userSchema.deleteUser, 'body'), 
  deleteUser
);

router.patch(
  '/:id', 
  protect, 
  validate(idSchema, 'params', { key: 'id' }), 
  validate(userSchema.updateUser, 'body'), 
  updateUser
);

// Profile picture routes
router.post(
  '/me/upload-picture',
  protect,
  uploadProfileImageMiddleware,
  validate(userSchema.profilePicture, 'file'),
  uploadProfilePicture
);

router.delete(
  '/me/remove-picture',
  protect,
  validate(userSchema.deleteProfilePicture, 'body'),
  deleteProfilePicture
);

export default router;
