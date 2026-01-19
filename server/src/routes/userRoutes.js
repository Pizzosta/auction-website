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
import cacheMiddleware from '../middleware/cacheMiddleware.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: User management
 */

/**
 * @swagger
 * /api/v1/users:
 *   get:
 *     tags: [Users]
 *     summary: Retrieve all users (Admin only)
 *     security:
 *       - bearerAuth: []
 *     description: Get a paginated list of all users with filtering and sorting options. Requires admin privileges.
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search query for username, email, phone or name
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [user, admin]
 *         description: Filter by user role
 *       - in: query
 *         name: isVerified
 *         schema:
 *           type: boolean
 *         description: Filter by email verification status
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, deleted, all]
 *           default: active
 *         description: Filter by user status
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [firstname, lastname, createdAt, username, email, lastActiveAt]
 *           default: createdAt
 *         description: Field to sort by
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort order
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *         description: Number of items per page
 *       - in: query
 *         name: lastActiveAfter
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter users active after this date
 *       - in: query
 *         name: lastActiveBefore
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter users active before this date
 *     responses:
 *       200:
 *         description: List of users retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     pages:
 *                       type: integer
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       username:
 *                         type: string
 *                       email:
 *                         type: string
 *                       role:
 *                         type: string
 *                         enum: [user, admin]
 *                       isVerified:
 *                         type: boolean
 *                       isActive:
 *                         type: boolean
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (admin access required)
 *       500:
 *         description: Internal server error
 */
router.get(
  '/',
  protect,
  admin,
  cacheMiddleware({ includeUserInCacheKey: true }),
  validate(userQuerySchema.search, 'query'),
  getAllUsers
);

/**
 * @swagger
 * /api/v1/users/me:
 *   get:
 *     tags: [Users]
 *     summary: Get current user profile
 *     security:
 *       - bearerAuth: []
 *     description: Retrieve the profile of the currently authenticated user. Only accessible by the user themselves.
 *     responses:
 *       200:
 *         description: Current user profile retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     username:
 *                       type: string
 *                     email:
 *                       type: string
 *                     firstName:
 *                       type: string
 *                     lastName:
 *                       type: string
 *                     middlename:
 *                       type: string
 *                       nullable: true
 *                     phone:
 *                       type: string
 *                     role:
 *                       type: string
 *                       enum: [user, admin]
 *                     isVerified:
 *                       type: boolean
 *                     profilePicture:
 *                       type: string
 *                       nullable: true
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/me', protect, getMe);

/**
 * @swagger
 * /api/v1/users/{id}:
 *   patch:
 *     tags: [Users]
 *     summary: Update user details
 *     security:
 *       - bearerAuth: []
 *     description: Update user profile information. Users can only update their own profile, admins can update any profile.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID to update
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 30
 *                 example: "johndoe123"
 *               email:
 *                 type: string
 *                 format: email
 *                 example: john@example.com
 *               firstName:
 *                 type: string
 *                 example: "John"
 *               middlename:
 *                 type: string
 *                 nullable: true
 *                 example: "Michael"
 *               lastName:
 *                 type: string
 *                 example: "Doe"
 *               phone:
 *                 type: string
 *                 example: "+1234567890"
 *               currentPassword:
 *                 type: string
 *                 format: password
 *                 description: Required when changing password
 *                 example: "OldPass123!"
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *                 description: New password (requires currentPassword)
 *                 example: "NewPass123!"
 *               confirmPassword:
 *                 type: string
 *                 format: password
 *                 description: Must match password if provided
 *                 example: "NewPass123!"
 *     responses:
 *       200:
 *         description: User updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     username:
 *                       type: string
 *                     email:
 *                       type: string
 *                     firstName:
 *                       type: string
 *                     lastName:
 *                       type: string
 *                     phone:
 *                       type: string
 *                     role:
 *                       type: string
 *                     isVerified:
 *                       type: boolean
 *                     profilePicture:
 *                       type: string
 *                       nullable: true
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Invalid input data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (not the account owner or admin)
 *       404:
 *         description: User not found
 *       409:
 *         description: Conflict (duplicate username/email or version mismatch)
 *       500:
 *         description: Internal server error
 */
router.patch(
  '/:id',
  protect,
  validate(idSchema('id'), 'params'),
  validate(userSchema.updateUser, 'body'),
  updateUser
);

/**
 * @swagger
 * /api/v1/users/{id}:
 *   delete:
 *     tags: [Users]
 *     summary: Delete or deactivate a user
 *     security:
 *       - bearerAuth: []
 *     description: Soft delete a user by default. Admins can permanently delete with ?permanent=true query parameter.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID to delete
 *       - in: query
 *         name: permanent
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Set to true for permanent deletion (admin only)
 *     responses:
 *       200:
 *         description: User deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 message:
 *                   type: string
 *                   example: User deleted successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     isDeleted:
 *                       type: boolean
 *                     deletedAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (not the account owner or admin)
 *       404:
 *         description: User not found
 *       500:
 *         description: Internal server error
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
 * @swagger
 * /api/v1/users/{id}/restore:
 *   post:
 *     tags: [Users]
 *     summary: Restore a soft-deleted user
 *     security:
 *       - bearerAuth: []
 *     description: Restore a user that was previously soft-deleted. Admin access required.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID to restore
 *     responses:
 *       200:
 *         description: User restored successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 message:
 *                   type: string
 *                   example: User restored successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     isDeleted:
 *                       type: boolean
 *                     restoredAt:
 *                       type: string
 *                       format: date-time
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (admin access required)
 *       404:
 *         description: User not found
 *       409:
 *         description: User is not deleted
 *       500:
 *         description: Internal server error
 */
router.post('/:id/restore', protect, admin, validate(idSchema('id'), 'params'), restoreUser);

/**
 * @swagger
 * /api/v1/users/me/upload-picture:
 *   post:
 *     tags: [Users]
 *     summary: Upload profile picture
 *     security:
 *       - bearerAuth: []
 *     description: Upload a profile picture for the authenticated user. Supports JPG, JPEG, and PNG formats up to 5MB.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Image file (JPG, JPEG, PNG, max 5MB)
 *     responses:
 *       200:
 *         description: Profile picture uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 message:
 *                   type: string
 *                   example: Profile picture uploaded successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     profilePicture:
 *                       type: string
 *                       format: uri
 *                       example: "https://kawodze.com/api/uploads/profiles/user123.jpg"
 *       400:
 *         description: Invalid file format or validation error
 *       401:
 *         description: Unauthorized
 *       413:
 *         description: File too large (exceeds 5MB limit)
 *       415:
 *         description: Unsupported media type
 *       500:
 *         description: Internal server error
 */
router.post(
  '/me/upload-picture',
  protect,
  uploadProfileImageMiddleware,
  validate(userSchema.profilePicture, 'file'),
  uploadProfilePicture
);

/**
 * @swagger
 * /api/v1/users/me/remove-picture:
 *   delete:
 *     tags: [Users]
 *     summary: Remove profile picture
 *     security:
 *       - bearerAuth: []
 *     description: Remove the profile picture of the authenticated user.
 *     responses:
 *       200:
 *         description: Profile picture removed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 message:
 *                   type: string
 *                   example: Profile picture removed successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     profilePicture:
 *                       type: string
 *                       nullable: true
 *                       example: null
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: No profile picture found
 *       500:
 *         description: Internal server error
 */
router.delete(
  '/me/remove-picture',
  protect,
  validate(userSchema.deleteProfilePicture, 'body'),
  deleteProfilePicture
);

/**
 * @swagger
 * /api/v1/users/{id}:
 *   get:
 *     tags: [Users]
 *     summary: Get user by ID (Admin only)
 *     security:
 *       - bearerAuth: []
 *     description: Retrieve detailed information about a specific user. Requires admin privileges.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: User details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     username:
 *                       type: string
 *                     email:
 *                       type: string
 *                     firstName:
 *                       type: string
 *                     lastName:
 *                       type: string
 *                     middlename:
 *                       type: string
 *                       nullable: true
 *                     phone:
 *                       type: string
 *                     role:
 *                       type: string
 *                       enum: [user, admin]
 *                     isVerified:
 *                       type: boolean
 *                     isActive:
 *                       type: boolean
 *                     profilePicture:
 *                       type: string
 *                       nullable: true
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *                     lastActiveAt:
 *                       type: string
 *                       format: date-time
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (admin access required)
 *       404:
 *         description: User not found
 *       500:
 *         description: Internal server error
 */
router.get('/:id', protect, admin, validate(idSchema('id'), 'params'), getUserById);

export default router;
