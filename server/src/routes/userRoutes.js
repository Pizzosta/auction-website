import express from 'express';
import { protect, admin } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validationMiddleware.js';
import { userSchema, idSchema, userQuerySchema } from '../utils/validators.js';
import {
  deleteUser,
  restoreUser,
  updateUser,
  getMe,
  getAllUsers,
  uploadProfilePicture,
  deleteProfilePicture,
  getUserById,
} from '../controllers/userController.js';
import { uploadProfileImageMiddleware } from '../middleware/uploadMiddleware.js';

const router = express.Router();

/**
 * @route GET /api/users
 * @group Users - user management
 * @description Retrieve a list of all users. Requires admin privileges.
 * @param {string} search.query - Search query for username, email, or name
 * @param {string} role.query - Filter by user role
 * @param {boolean} isVerified.query - Filter by email verification status
 * @param {string} status.query - Filter by user status (active, deleted, all)
 * @param {string} sort.query - Sort field (createdAt, username, email)
 * @param {string} order.query - Sort order (asc, desc)
 * @param {number} page.query - Page number for pagination
 * @param {number} limit.query - Number of items per page
 * @param {date} lastActiveAfter.query - Filter users active after a specific date
 * @param {date} lastActiveBefore.query - Filter users active before a specific date
 * @returns {object} 200 - List of users
 * @returns {Error}  default - Unexpected error
 */
router.get('/', protect, admin, validate(userQuerySchema.search, 'query'), getAllUsers);

/**
 * @route GET /api/users/me
 * @group Users - user management
 * @description Get the profile of the currently authenticated user.
 * @header {string} Authorization - Bearer token for authentication
 * @returns {object} 200 - Current user profile
 * @returns {Error} 401 - Unauthorized
 * @returns {Error}  default - Unexpected error
 */
router.get('/me', protect, getMe);

/**
 * @route PATCH /api/users/{id}
 * @group Users - user management
 * @description Update user details by user ID. Only allowed for the user or admin.
 * @header {string} Authorization - Bearer token for authentication
 * @param {string} id.path.required - User ID to update
 * @param {string} username.body - New username (must be unique)
 * @param {string} email.body - New email (must be unique)
 * @param {string} firstName.body - User's first name
 * @param {string} lastName.body - User's last name
 * @param {string} phone.body - User's phone number (must be unique)
 * @param {string} currentPassword.body - Required when changing password
 * @param {string} password.body - New password (requires currentPassword)
 * @param {string} confirmPassword.body - Must match password if provided
 * @returns {object} 200 - User updated successfully
 * @returns {Error} 400 - Invalid input data
 * @returns {Error} 401 - Unauthorized
 * @returns {Error} 403 - Forbidden (not the account owner or admin)
 * @returns {Error} 404 - User not found
 * @returns {Error} 409 - Version conflict or duplicate data
 * @returns {Error}  default - Unexpected error
 */
router.patch(
  '/:id',
  protect,
  validate(idSchema('id'), 'params'),
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
  validate(idSchema('id'), 'params'),
  validate(userQuerySchema.delete, 'query'),
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
router.post('/:id/restore', protect, admin, validate(idSchema('id'), 'params'), restoreUser);

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

/**
 * @route GET /api/users/{id}
 * @group Users - user management
 * @description Get user details by user ID. Requires admin privileges.
 * @param {string} id.path.required
 * @returns {object} 200 - User details
 * @returns {Error}  default - Unexpected error
 */
router.get('/:id', protect, admin, validate(idSchema('id'), 'params'), getUserById);

export default router;
