import express from 'express';
import {
  addToWatchlist,
  removeFromWatchlist,
  getWatchlist,
} from '../controllers/watchlistController.js';
import { protect } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validationMiddleware.js';
import { watchlistSchema } from '../utils/validators.js';

const router = express.Router();

/**
 * @route POST /api/watchlist/add
 * @group Watchlist - watchlist management
 * @description Add an auction to the user's watchlist. Requires authentication.
 * @param {AddToWatchlist.model} body.body.required
 * @param {string} auctionId.body.required - ID of the auction to add
 * @returns {object} 200 - Auction added to watchlist
 * @returns {Error}  default - Unexpected error
 */
router.post('/add', protect, validate(watchlistSchema.add, 'body'), addToWatchlist);

/**
 * @route DELETE /api/watchlist/remove
 * @group Watchlist - watchlist management
 * @description Remove an auction from the user's watchlist. Requires authentication.
 * @param {RemoveFromWatchlist.model} body.body.required
 * @param {string} auctionId.body.required - ID of the auction to remove
 * @returns {object} 200 - Auction removed from watchlist
 * @returns {Error}  default - Unexpected error
 */
router.delete('/remove', protect, validate(watchlistSchema.remove, 'body'), removeFromWatchlist);

/**
 * @route GET /api/watchlist
 * @group Watchlist - watchlist management
 * @description Get the authenticated user's watchlist. Requires authentication.
 * @returns {object} 200 - List of auctions in the user's watchlist
 * @returns {Error}  default - Unexpected error
 */
router.get('/', protect, getWatchlist);

export default router;
