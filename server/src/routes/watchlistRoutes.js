import express from 'express';
import {
  addToWatchlist,
  removeFromWatchlist,
  toggleWatchlist,
  getWatchlist,
  checkWatchlistStatus,
} from '../controllers/watchlistController.js';
import { protect } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validationMiddleware.js';
import { idSchema, watchlistSchema, watchlistQuerySchema } from '../utils/validators.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Watchlist
 *   description: Watchlist management
 */

/**
 * @swagger
 * /api/v1/watchlist/add:
 *   post:
 *     tags: [Watchlist]
 *     summary: Add an auction to watchlist
 *     description: Add an auction to the authenticated user's watchlist
 *     security:
 *       - bearerAuth: []
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
 *                 format: uuid
 *                 description: ID of the auction to add to watchlist
 *                 example: "123e4567-e89b-12d3-a456-426614174000"
 *     responses:
 *       200:
 *         description: Auction successfully added to watchlist
 *       400:
 *         description: Invalid input or auction already in watchlist
 *       401:
 *         description: Unauthorized - Authentication required
 *       404:
 *         description: Auction not found
 *       409:
 *         description: Auction already in watchlist
 */
router.post('/add', protect, validate(watchlistSchema.add, 'body'), addToWatchlist);

/**
 * @swagger
 * /api/v1/watchlist/remove:
 *   delete:
 *     tags: [Watchlist]
 *     summary: Remove an auction from watchlist
 *     description: Remove an auction from the authenticated user's watchlist
 *     security:
 *       - bearerAuth: []
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
 *                 format: uuid
 *                 description: ID of the auction to remove from watchlist
 *                 example: "123e4567-e89b-12d3-a456-426614174000"
 *     responses:
 *       200:
 *         description: Auction successfully removed from watchlist
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized - Authentication required
 *       404:
 *         description: Watchlist item not found
 */
router.delete('/remove', protect, validate(watchlistSchema.remove, 'body'), removeFromWatchlist);

/**
 * @swagger
 * /api/v1/watchlist/toggle:
 *   post:
 *     tags: [Watchlist]
 *     summary: Toggle auction in watchlist
 *     description: Add to watchlist if not present, remove if already in watchlist
 *     security:
 *       - bearerAuth: []
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
 *                 format: uuid
 *                 description: ID of the auction to toggle in watchlist
 *                 example: "123e4567-e89b-12d3-a456-426614174000"
 *     responses:
 *       200:
 *         description: Watchlist status toggled successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized - Authentication required
 *       404:
 *         description: Auction not found
 */
router.post('/toggle', protect, validate(watchlistSchema.toggle, 'body'), toggleWatchlist);

/**
 * @swagger
 * /api/v1/watchlist:
 *   get:
 *     tags: [Watchlist]
 *     summary: Get user's watchlist
 *     description: Retrieve paginated list of auctions in the authenticated user's watchlist
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, upcoming, ended, sold]
 *           default: active
 *         description: Filter auctions by status
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [newest, oldest]
 *           default: newest
 *         description: Sort order for results
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
 *     responses:
 *       200:
 *         description: Successfully retrieved watchlist
 *       400:
 *         description: Invalid query parameters
 *       401:
 *         description: Unauthorized - Authentication required
 */
router.get('/', protect, validate(watchlistQuerySchema, 'query'), getWatchlist);

/**
 * @swagger
 * /api/v1/watchlist/check/{auctionId}:
 *   get:
 *     tags: [Watchlist]
 *     summary: Check auction watchlist status
 *     description: Check if an auction is in the authenticated user's watchlist
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: auctionId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID of the auction to check
 *     responses:
 *       200:
 *         description: Successfully checked watchlist status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 isWatching:
 *                   type: boolean
 *                   description: Whether the auction is in the user's watchlist
 *                   example: true
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                   description: The date and time when the watchlist item was created
 *                   example: "2025-01-01T00:00:00.000Z"
 *                 auctionId:
 *                   type: string
 *                   format: uuid
 *                   description: The auction ID that was checked
 *                   example: "123e4567-e89b-12d3-a456-426614174000"
 *       400:
 *         description: Invalid auction ID format
 *       401:
 *         description: Unauthorized - Authentication required
 *       404:
 *         description: Auction not found
 */
router.get(
  '/check/:auctionId',
  protect,
  validate(idSchema('auctionId'), 'params'),
  checkWatchlistStatus
);

export default router;
