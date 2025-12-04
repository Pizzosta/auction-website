import express from 'express';
import {
  placeBid,
  getBidsByAuction,
  getMyBids,
  getAllBids,
  deleteBid,
} from '../controllers/bidController.js';
import { protect, admin } from '../middleware/authMiddleware.js';
import { bidSchema, idSchema, bidQuerySchema } from '../utils/validators.js';
import { validate } from '../middleware/validationMiddleware.js';
import { bidLimiter } from '../middleware/security.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Bids
 *   description: Bids management
 */

/**
 * @swagger
 * /api/v1/bids:
 *   post:
 *     tags: [Bids]
 *     summary: Place a bid on an auction
 *     security:
 *       - bearerAuth: []
 *     description: |
 *       Place a new bid on an active auction. Implements:
 *       - Rate limiting (10 bids/minute per user)
 *       - Distributed locking to prevent race conditions
 *       - Automatic outbid notifications to previous bidders
 *       - Auction time extension on first bid (anti-sniping)
 *       - Optimistic concurrency control
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - auctionId
 *               - amount
 *             properties:
 *               auctionId:
 *                 type: string
 *                 description: ID of the auction to bid on
 *                 example: "7d7e39d3-6b72-4372-b800-04e301d5472a"
 *               amount:
 *                 type: number
 *                 description: Bid amount (must be ≥ currentPrice + bidIncrement)
 *                 minimum: 0.01
 *                 example: 150.00
 *     responses:
 *       201:
 *         description: Bid placed successfully
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
 *                     amount:
 *                       type: number
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     auctionId:
 *                       type: string
 *                     bidder:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         username:
 *                           type: string
 *       400:
 *         description: |
 *           Invalid request - Possible causes:
 *           - Missing required fields
 *           - Auction not active or ended
 *           - Bid amount too low
 *           - User bidding on own auction
 *           - Duplicate active bid at same amount
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (e.g., bidding on own auction)
 *       409:
 *         description: Concurrent modification error (retry suggested)
 *       429:
 *         description: Too many bid attempts (rate limit exceeded)
 *       500:
 *         description: Internal server error
 */
router.post('/', protect, bidLimiter, validate(bidSchema.create, 'body'), placeBid);

/**
 * @swagger
 * /api/v1/bids/{auctionId}:
 *   get:
 *     tags: [Bids]
 *     summary: Get bids for a specific auction
 *     description: Retrieve paginated list of bids for an auction. Public access but respects auction privacy rules.
 *     parameters:
 *       - in: path
 *         name: auctionId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the auction
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *         description: Items per page
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [createdAt, amount, updatedAt]
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
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, won, lost, outbid, cancelled]
 *         description: Filter by bid status
 *       - in: query
 *         name: bidderId
 *         schema:
 *           type: string
 *         description: Filter by specific bidder (admin/seller only)
 *       - in: query
 *         name: minAmount
 *         schema:
 *           type: number
 *           minimum: 0
 *         description: Minimum bid amount filter
 *       - in: query
 *         name: maxAmount
 *         schema:
 *           type: number
 *           minimum: 0
 *         description: Maximum bid amount filter
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter bids placed after this date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter bids placed before this date
 *       - in: query
 *         name: fields
 *         schema:
 *           type: string
 *         description: Comma-separated list of fields to include
 *     responses:
 *       200:
 *         description: Bids retrieved successfully
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
 *                     itemsPerPage:
 *                       type: integer
 *                     hasNext:
 *                       type: boolean
 *                     hasPrev:
 *                       type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     bids:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           amount:
 *                             type: number
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                           bidder:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: string
 *                               username:
 *                                 type: string
 *                               profilePicture:
 *                                 type: string
 *                                 nullable: true
 *                           isOutbid:
 *                             type: boolean
 *       400:
 *         description: Invalid parameters
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (viewing cancelled bids without permission)
 *       404:
 *         description: Auction not found
 *       500:
 *         description: Internal server error
 */
router.get(
  '/:auctionId',
  validate(idSchema('auctionId'), 'params'),
  validate(bidQuerySchema.auctionBidSort, 'query'),
  getBidsByAuction
);

/**
 * @swagger
 * /api/v1/bids/me:
 *   get:
 *     tags: [Bids]
 *     summary: Get my bids
 *     security:
 *       - bearerAuth: []
 *     description: Retrieve all bids placed by the currently authenticated user with full filtering and pagination.
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *         description: Items per page
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [createdAt, amount, updatedAt]
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
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, won, lost, outbid, cancelled]
 *         description: Filter by bid status
 *       - in: query
 *         name: auctionId
 *         schema:
 *           type: string
 *         description: Filter by specific auction
 *       - in: query
 *         name: minAmount
 *         schema:
 *           type: number
 *           minimum: 0
 *         description: Minimum bid amount filter
 *       - in: query
 *         name: maxAmount
 *         schema:
 *           type: number
 *           minimum: 0
 *         description: Maximum bid amount filter
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter bids placed after this date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter bids placed before this date
 *       - in: query
 *         name: fields
 *         schema:
 *           type: string
 *         description: Comma-separated list of fields to include
 *     responses:
 *       200:
 *         description: User's bids retrieved successfully
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
 *                     itemsPerPage:
 *                       type: integer
 *                     hasNext:
 *                       type: boolean
 *                     hasPrev:
 *                       type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     bids:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           amount:
 *                             type: number
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                           auction:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: string
 *                               title:
 *                                 type: string
 *                               status:
 *                                 type: string
 *                               endDate:
 *                                 type: string
 *                                 format: date-time
 *                           isOutbid:
 *                             type: boolean
 *                           isDeleted:
 *                             type: boolean
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/me', protect, validate(bidQuerySchema.personalBidSort, 'query'), getMyBids);

/**
 * @swagger
 * /api/v1/bids/{bidId}:
 *   delete:
 *     tags: [Bids]
 *     summary: Delete a bid
 *     security:
 *       - bearerAuth: []
 *     description: |
 *       Delete/cancel a bid. Users can cancel their own bids (max 1 per auction).
 *       Admins can delete any bid. Soft delete by default; permanent delete requires admin query param.
 *       Restrictions: Cannot cancel bids within final hour of active auction, or on completed/sold auctions.
 *     parameters:
 *       - in: path
 *         name: bidId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the bid to delete
 *       - in: query
 *         name: permanent
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Set to true for permanent deletion (admin only)
 *     responses:
 *       200:
 *         description: Bid deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Bid cancelled successfully
 *       400:
 *         description: |
 *           Invalid request - Possible causes:
 *           - Bid already cancelled
 *           - Auction ended/completed/sold
 *           - Cancellation window closed (within final hour)
 *           - Maximum cancellation limit reached
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (not bid owner or admin)
 *       404:
 *         description: Bid not found
 *       409:
 *         description: Concurrent modification error (retry suggested)
 *       500:
 *         description: Internal server error
 */
router.delete(
  '/:bidId',
  protect,
  validate(idSchema('bidId'), 'params'),
  validate(bidQuerySchema.delete, 'query'),
  deleteBid
);

/**
 * @swagger
 * /api/v1/bids:
 *   get:
 *     tags: [Bids]
 *     summary: Get all bids (Admin only)
 *     security:
 *       - bearerAuth: []
 *     description: Retrieve all bids system-wide with full filtering and pagination. Admin access required.
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *         description: Items per page
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [createdAt, amount, updatedAt]
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
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, won, lost, outbid, cancelled]
 *         description: Filter by bid status
 *       - in: query
 *         name: auctionId
 *         schema:
 *           type: string
 *         description: Filter by auction ID
 *       - in: query
 *         name: bidderId
 *         schema:
 *           type: string
 *         description: Filter by bidder ID
 *       - in: query
 *         name: minAmount
 *         schema:
 *           type: number
 *           minimum: 0
 *         description: Minimum bid amount filter
 *       - in: query
 *         name: maxAmount
 *         schema:
 *           type: number
 *           minimum: 0
 *         description: Maximum bid amount filter
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter bids placed after this date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter bids placed before this date
 *       - in: query
 *         name: fields
 *         schema:
 *           type: string
 *         description: Comma-separated list of fields to include
 *     responses:
 *       200:
 *         description: All bids retrieved successfully
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
 *                     itemsPerPage:
 *                       type: integer
 *                     hasNext:
 *                       type: boolean
 *                     hasPrev:
 *                       type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     bids:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           amount:
 *                             type: number
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                           bidder:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: string
 *                               username:
 *                                 type: string
 *                               profilePicture:
 *                                 type: string
 *                                 nullable: true
 *                           auction:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: string
 *                               title:
 *                                 type: string
 *                               status:
 *                                 type: string
 *                           isOutbid:
 *                             type: boolean
 *                           isDeleted:
 *                             type: boolean
 *                           deletedAt:
 *                             type: string
 *                             format: date-time
 *                             nullable: true
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (admin access required)
 *       500:
 *         description: Internal server error
 */
router.get('/', protect, admin, validate(bidQuerySchema.adminBidSort, 'query'), getAllBids);

export default router;