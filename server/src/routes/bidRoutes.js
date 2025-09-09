import express from 'express';
import { placeBid, getBidsByAuction, getMyBids } from '../controllers/bidController.js';
import { protect } from '../middleware/authMiddleware.js';
import { bidSchema, idSchema, bidQuerySchema } from '../utils/validators.js';
import { validate } from '../middleware/validationMiddleware.js';
import { bidLimiter } from '../middleware/security.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Bids
 *   description: Bid management
 */

/**
 * @swagger
 * /api/bids/auction/{auctionId}:
 *   get:
 *     summary: Get all bids for an auction
 *     tags: [Bids]
 *     parameters:
 *       - in: path
 *         name: auctionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Auction ID
 *     responses:
 *       200:
 *         description: List of bids
 *       404:
 *         description: Auction not found
 */

/**
 * @swagger
 * /api/bids:
 *   post:
 *     summary: Place a bid
 *     tags: [Bids]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PlaceBid'
 *     responses:
 *       201:
 *         description: Bid placed
 *       400:
 *         description: Validation error
 */

/**
 * @swagger
 * /api/bids/me:
 *   get:
 *     summary: Get current user's bids
 *     tags: [Bids]
 *     responses:
 *       200:
 *         description: List of user's bids
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     PlaceBid:
 *       type: object
 *       required:
 *         - amount
 *         - auctionId
 *       properties:
 *         amount:
 *           type: number
 *           example: 120.5
 *         auctionId:
 *           type: string
 *           example: "60f7c2b8e1d3c2a5b8e1d3c2"
 */

// Public routes
router.get(
  '/auction/:auctionId',
  validate(idSchema, 'params', { key: 'auctionId' }),
  validate(bidQuerySchema, 'query'),
  getBidsByAuction
);

// Protected routes
router.post(
  '/', 
  protect,
  bidLimiter, 
  validate(bidSchema.create, 'body'), 
  placeBid
);

router.get(
  '/me',
  protect,
  validate(bidQuerySchema, 'query'),
  getMyBids
);

export default router;
