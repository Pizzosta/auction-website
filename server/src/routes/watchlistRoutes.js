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
 * @route POST /api/watchlist/toggle
 * @group Watchlist - watchlist management
 * @description Toggle an auction's status in the user's watchlist. Requires authentication.
 * @param {ToggleWatchlist.model} body.body.required
 * @param {string} auctionId.body.required - ID of the auction to toggle
 * @returns {object} 200 - Auction status toggled in the user's watchlist
 * @returns {Error}  default - Unexpected error
 */
router.post('/toggle', protect, validate(watchlistSchema.toggle, 'body'), toggleWatchlist);

/**
 * @route GET /api/watchlist
 * @group Watchlist - watchlist management
 * @description Get the authenticated user's watchlist. Requires authentication.
 * @returns {object} 200 - List of auctions in the user's watchlist
 * @returns {Error}  default - Unexpected error
 */
router.get('/', protect, validate(watchlistQuerySchema, 'query'), getWatchlist);

/**
 * @route GET /api/watchlist/check/:auctionId
 * @group Watchlist - watchlist management
 * @description Check if an auction is in the user's watchlist. Requires authentication.
 * @param {string} auctionId.params.required - ID of the auction to check
 * @returns {object} 200 - Auction status in the user's watchlist
 * @returns {Error}  default - Unexpected error
 */
router.get('/check/:auctionId', protect, validate(idSchema('auctionId'), 'params'), checkWatchlistStatus);

export default router;
