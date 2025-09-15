import express from 'express';
import { protect, admin } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validationMiddleware.js';
import { userSchema, idSchema, userQuerySchema, userDeleteQuerySchema } from '../utils/validators.js';
import {
  deleteUser,
  restoreUser,
  updateUser,
  getMe,
  getAllUsers,
  uploadProfilePicture,
  deleteProfilePicture,
} from '../controllers/userController.js';
import { uploadProfileImageMiddleware } from '../middleware/uploadMiddleware.js';

const router = express.Router();

/**
 * @route GET /api/users
 * @group Users - user management
 * @description Retrieve a list of all users. Requires admin privileges.
 * @returns {object} 200 - List of users
 * @returns {Error}  default - Unexpected error
 */
router.get('/', protect, admin, validate(userQuerySchema, 'query'), getAllUsers);

/**
 * @route GET /api/users/me
 * @group Users - user management
 * @description Get the profile of the currently authenticated user.
 * @returns {object} 200 - Current user profile
 * @returns {Error}  default - Unexpected error
 */
router.get('/me', protect, getMe);

/**
 * @route PATCH /api/users/{id}
 * @group Users - user management
 * @description Update user details by user ID. Only allowed for the user or admin.
 * @param {string} id.path.required
 * @param {UpdateUser.model} body.body.required
 * @returns {object} 200 - User updated
 * @returns {Error}  default - Unexpected error
 */
router.patch(
  '/:id',
  protect,
  validate(idSchema, 'params', { key: 'id' }),
  validate(userSchema.updateUser, 'body'),
  updateUser
);

/**
 * @route DELETE /api/users/{id}
 * @group Users - user management
 * @description Delete a user by ID. Only allowed for the user or admin.
 *              Soft delete by default. Add `?permanent=true` (admin only) to permanently delete.
 * @param {string} id.path.required
 * @param {boolean} permanent.query - Permanently delete the user (admin only)
 * @returns {object} 200 - User deleted
 * @returns {Error}  default - Unexpected error
 */
router.delete(
  '/:id',
  protect,
  validate(idSchema, 'params', { key: 'id' }),
  validate(userDeleteQuerySchema, 'query'),
  validate(userSchema.deleteUser, 'body'),
  deleteUser
);

/**
 * @route POST /api/users/{id}/restore
 * @group Users - user management
 * @description Restore a soft-deleted user. Only allowed for admin.
 * @param {string} id.path.required
 * @returns {object} 200 - User restored
 * @returns {Error}  default - Unexpected error
 */
router.post(
  '/:id/restore',
  protect,
  admin,
  validate(idSchema, 'params', { key: 'id' }),
  restoreUser
);

/**
 * @route POST /api/users/me/upload-picture
 * @group Users - user management
 * @description Upload a profile picture for the authenticated user.
 * @returns {object} 200 - Profile picture uploaded
 * @returns {Error}  default - Unexpected error
 */
router.post(
  '/me/upload-picture',
  protect,
  uploadProfileImageMiddleware,
  validate(userSchema.profilePicture, 'file'),
  uploadProfilePicture
);

/**
 * @route DELETE /api/users/me/remove-picture
 * @group Users - user management
 * @description Remove the profile picture of the authenticated user.
 * @returns {object} 200 - Profile picture removed
 * @returns {Error}  default - Unexpected error
 */
router.delete(
  '/me/remove-picture',
  protect,
  validate(userSchema.deleteProfilePicture, 'body'),
  deleteProfilePicture
);

export default router;
