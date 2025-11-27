import express from 'express';
import { featuredAuctionQuerySchema, featuredAuctionSchema } from '../utils/validators.js';
import { protect, admin } from '../middleware/authMiddleware.js';
import {
  addFeaturedAuction,
  removeFeaturedAuction,
  getPublicFeaturedAuctions,
  getFeaturedAuctions,
  restoreFeaturedAuction,
} from '../controllers/featuredAuctionController.js';
import { validate } from '../middleware/validationMiddleware.js';

const router = express.Router();

/**
 * @swagger
 * /api/featured-auctions/add:
 *   post:
 *     tags: [Featured Auctions]
 *     summary: Add auction to featured list
 *     security:
 *       - bearerAuth: []
 *     description: Add a specific auction to the featured list. Requires admin privileges. Only upcoming or active auctions can be featured.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - auctionId
 *             properties:
 *               auctionId:
 *                 type: string
 *                 description: ID of the auction to feature
 *                 example: "b118dae6-b165-41d9-9fee-c7991397d581"
 *     responses:
 *       201:
 *         description: Auction successfully added to featured list
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
 *                     auctionId:
 *                       type: string
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Invalid input data or auction status
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (admin access required)
 *       404:
 *         description: Auction not found
 *       409:
 *         description: Auction already featured
 *       500:
 *         description: Internal server error
 */
router.post(
  '/add',
  protect,
  admin,
  validate(featuredAuctionSchema.add, 'body'),
  addFeaturedAuction
);

/**
 * @swagger
 * /api/featured-auctions/remove:
 *   delete:
 *     tags: [Featured Auctions]
 *     summary: Remove auction from featured list
 *     security:
 *       - bearerAuth: []
 *     description: Remove an auction from the featured list. Soft delete by default. Admins can permanently remove with query parameter.
 *     parameters:
 *       - in: query
 *         name: permanent
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Set to true for permanent deletion (admin only)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - auctionId
 *             properties:
 *               auctionId:
 *                 type: string
 *                 description: ID of the featured auction to remove
 *                 example: "b118dae6-b165-41d9-9fee-c7991397d581"
 *     responses:
 *       200:
 *         description: Auction removed from featured list
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
 *                   example: Auction removed from featured list
 *                 data:
 *                   type: object
 *                   properties:
 *                     auctionId:
 *                       type: string
 *                     removed:
 *                       type: boolean
 *                     permanentlyRemoved:
 *                       type: boolean
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (admin access required)
 *       404:
 *         description: Featured auction not found
 *       500:
 *         description: Internal server error
 */
router.delete(
  '/remove',
  protect,
  admin,
  validate(featuredAuctionQuerySchema.delete, 'query'),
  validate(featuredAuctionSchema.remove, 'body'),
  removeFeaturedAuction
);

/**
 * @swagger
 * /api/featured-auctions/admin:
 *   get:
 *     tags: [Featured Auctions]
 *     summary: Get all featured auctions (Admin view)
 *     security:
 *       - bearerAuth: []
 *     description: Retrieve a comprehensive list of all featured auctions including inactive/removed ones. Requires admin privileges.
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive, all]
 *           default: active
 *         description: Filter by featured status
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [newest, oldest]
 *           default: newest
 *         description: Sort field
 *     responses:
 *       200:
 *         description: Featured auctions retrieved successfully
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
 *                       auctionId:
 *                         type: string
 *                       startDate:
 *                         type: string
 *                         format: date-time
 *                       endDate:
 *                         type: string
 *                         format: date-time
 *                       isActive:
 *                         type: boolean
 *                       auction:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           title:
 *                             type: string
 *                           startingPrice:
 *                             type: number
 *                           currentPrice:
 *                             type: number
 *                       addedBy:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           username:
 *                             type: string
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       updatedAt:
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
  '/admin',
  protect,
  admin,
  validate(featuredAuctionQuerySchema.search, 'query'),
  getFeaturedAuctions
);

/**
 * @swagger
 * /api/featured-auctions:
 *   get:
 *     tags: [Featured Auctions]
 *     summary: Get public featured auctions
 *     security: []
 *     description: Retrieve all currently featured auctions visible to the public. No authentication required. Only returns active featured auctions with their associated auction details.
 *     parameters:
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [newest, oldest]
 *           default: newest
 *         description: Sort field
 *     responses:
 *       200:
 *         description: Featured auctions retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       auctionId:
 *                         type: string
 *                       auction:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           title:
 *                             type: string
 *                           description:
 *                             type: string
 *                           startingPrice:
 *                             type: number
 *                           currentPrice:
 *                             type: number
 *                           endDate:
 *                             type: string
 *                             format: date-time
 *                           images:
 *                             type: array
 *                             items:
 *                               type: string
 *                               format: uri
 *                           seller:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: string
 *                               username:
 *                                 type: string
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *       500:
 *         description: Internal server error
 */
router.get('/', getPublicFeaturedAuctions);

/**
 * @swagger
 * /api/featured-auctions/restore:
 *   patch:
 *     tags: [Featured Auctions]
 *     summary: Restore featured auction
 *     security:
 *       - bearerAuth: []
 *     description: Restore a previously soft-deleted featured auction. Admin access required. Only upcoming or active auctions can be restored.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - auctionId
 *             properties:
 *               auctionId:
 *                 type: string
 *                 description: ID of the featured auction to restore
 *                 example: "cm3q5g4v50001vw9a8x6b7c2d"
 *     responses:
 *       200:
 *         description: Featured auction restored successfully
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
 *                   example: Featured auction restored successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     auctionId:
 *                       type: string
 *                     isActive:
 *                       type: boolean
 *                     restoredAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Invalid request or auction status
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (admin access required)
 *       404:
 *         description: Featured auction not found
 *       409:
 *         description: Featured auction already active
 *       500:
 *         description: Internal server error
 */
router.patch(
  '/restore',
  protect,
  admin,
  validate(featuredAuctionSchema.restore, 'body'),
  restoreFeaturedAuction
);

export default router;
