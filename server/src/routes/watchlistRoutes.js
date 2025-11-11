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
 * @description Get the authenticated user's watchlist with optional filters.
 * @header {string} Authorization - Bearer token for authentication
 * @param {string} status.query - Filter by auction status (active, upcoming, ended)
 * @param {string} sort.query - Sort field (addedAt, endDate, currentPrice)
 * @param {string} order.query - Sort order (asc, desc)
 * @param {number} page.query - Page number for pagination
 * @param {number} limit.query - Number of items per page
 * @returns {object} 200 - User's watchlist with auctions
 * @returns {Error} 401 - Unauthorized
 * @returns {Error}  default - Unexpected error
 * @description Get the authenticated user's watchlist. Requires authentication.
 * @returns {object} 200 - List of auctions in the user's watchlist
 * @returns {Error}  default - Unexpected error
 */
router.get('/', protect, validate(watchlistQuerySchema, 'query'), getWatchlist);

/**
 * @route GET /api/watchlist/check/{auctionId}
 * @group Watchlist - watchlist management
 * @description Check if an auction is in the user's watchlist.
 * @header {string} Authorization - Bearer token for authentication
 * @param {string} auctionId.path.required - ID of the auction to check
 * @returns {object} 200 - Watchlist status
 * @property {boolean} isInWatchlist - Whether the auction is in the user's watchlist
 * @property {string} auctionId - The auction ID that was checked
 * @property {string} userId - The ID of the user who owns the watchlist
 * @returns {Error} 400 - Invalid auction ID
 * @returns {Error} 401 - Unauthorized
 * @returns {Error} 404 - Auction not found
 * @returns {Error}  default - Unexpected error
 */
router.get(
  '/check/:auctionId',
  protect,
  validate(idSchema('auctionId'), 'params'),
  checkWatchlistStatus
);

export default router;
