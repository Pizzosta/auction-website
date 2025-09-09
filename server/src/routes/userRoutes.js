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

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: User management
 */

/**
 * @swagger
 * /api/users:
 *   get:
 *     summary: Get all users (admin only)
 *     tags: [Users]
 *     responses:
 *       200:
 *         description: List of users
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /api/users/me:
 *   get:
 *     summary: Get current user profile
 *     security:
 *       - bearerAuth: []
 *     tags:
 *       - Users
 *     responses:
 *       200:
 *         description: User profile
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /api/users/{id}:
 *   delete:
 *     summary: Delete a user
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: User deleted
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 *
 *   patch:
 *     summary: Update a user
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateUser'
 *     responses:
 *       200:
 *         description: User updated
 *       400:
 *         description: Validation error
 *       404:
 *         description: User not found
 */

/**
 * @swagger
 * /api/users/me/upload-picture:
 *   post:
 *     summary: Upload profile picture
 *     tags: [Users]
 *     responses:
 *       200:
 *         description: Profile picture uploaded
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /api/users/me/remove-picture:
 *   delete:
 *     summary: Delete profile picture
 *     tags: [Users]
 *     responses:
 *       200:
 *         description: Profile picture deleted
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     UpdateUser:
 *       type: object
 *       properties:
 *         firstname:
 *           type: string
 *           example: John
 *         lastname:
 *           type: string
 *           example: Doe
 *         middlename:
 *           type: string
 *           example: Kwame
 *         phone:
 *           type: string
 *           example: "+233500000666"
 *         username:
 *           type: string
 *           example: johndoe
 *         email:
 *           type: string
 *           example: johndoe@example.com
 *         password:
 *           type: string
 *           example: "StrongPassword123!"
 *         currentPassword:
 *           type: string
 *           example: "OldPassword123!"
 *         confirmPassword:
 *           type: string
 *           example: "StrongPassword123!"
 *         role:
 *           type: string
 *           enum: [user, admin]
 *         avatar:
 *           type: object
 *           properties:
 *             url:
 *               type: string
 *               example: "https://example.com/avatar.jpg"
 *             publicId:
 *               type: string
 *               example: "cloudinary-id"
 *         rating:
 *           type: number
 *           example: 4.5
 *         bio:
 *           type: string
 *           example: "I love auctions!"
 *         location:
 *           type: string
 *           example: "Accra, Ghana"
 *         isVerified:
 *           type: boolean
 *           example: true
 */

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
