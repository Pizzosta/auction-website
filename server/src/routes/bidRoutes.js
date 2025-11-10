import express from 'express';
import {
  placeBid,
  getBidsByAuction,
  getMyBids,
  getAllBids,
  deleteBid,
  restoreBid,
} from '../controllers/bidController.js';
import { protect, admin } from '../middleware/authMiddleware.js';
import { bidSchema, idSchema, bidQuerySchema } from '../utils/validators.js';
import { validate } from '../middleware/validationMiddleware.js';
import { bidLimiter } from '../middleware/security.js';

const router = express.Router();

/**
 * @route POST /api/bids
 * @group Bids - bid management
 * @description Place a bid on an auction. Requires authentication and rate limiting.
 * @param {PlaceBid.model} body.body.required
 * @returns {object} 201 - Bid placed
 * @returns {Error}  default - Unexpected error
 */
router.post('/', protect, bidLimiter, validate(bidSchema.create, 'body'), placeBid);

/**
 * @route GET /api/bids/auction/{auctionId}
 * @group Bids - bid management
 * @description Retrieve all bids for a specific auction by auction ID.
 * @param {string} auctionId.path.required
 * @returns {object} 200 - List of bids for auction
 * @returns {Error}  default - Unexpected error
 */
router.get(
  '/auction/:auctionId',
  validate(idSchema('auctionId'), 'params'),
  validate(bidQuerySchema.auctionBidSort, 'query'),
  getBidsByAuction
);

/**
 * @route GET /api/bids/me
 * @group Bids - bid management
 * @description Get all bids placed by the currently authenticated user.
 * @returns {object} 200 - List of user's bids
 * @returns {Error}  default - Unexpected error
 */
router.get('/me', protect, validate(bidQuerySchema.personalBidSort, 'query'), getMyBids);

/**
 * @route DELETE /api/bids/{bidId}
 * @group Bids - bid management
 * @description Delete a bid by ID. Only allowed for the user or admin.
 *              Soft delete by default. Add `?permanent=true` (admin only) to permanently delete.
 * @param {string} bidId.path.required - The ID of the bid to delete
 * @param {boolean} permanent.query - Whether to permanently delete the bid (admin only)
 * @returns {object} 200 - Bid deleted successfully
 * @returns {Error} 403 - Not authorized
 * @returns {Error} 404 - Bid not found
 * @returns {Error} default - Unexpected error
 */
router.delete(
  '/:bidId',
  protect,
  validate(idSchema('bidId'), 'params'),
  validate(bidQuerySchema.delete, 'query'),
  deleteBid
);

/**
 * @route PATCH /api/bids/{bidId}/restore
 * @group Bids - bid management
 * @description Restore a soft-deleted bid (admin only)
 * @param {string} bidId.path.required - The ID of the bid to restore
 * @returns {object} 200 - Bid restored successfully
 * @returns {Error} 403 - Not authorized
 * @returns {Error} 404 - Bid not found or not deleted
 * @returns {Error} default - Unexpected error
 */
router.patch('/:bidId/restore', protect, admin, validate(idSchema('bidId'), 'params'), restoreBid);

/**
 * @route GET /api/bids
 * @group Bids - bid management
 * @description Get all bids with filtering and pagination (Admin only)
 * @param {string} status.query.optional - Filter by status (active, won, lost, outbid)
 * @param {string} auctionId.query.optional - Filter by auction ID
 * @param {string} bidderId.query.optional - Filter by bidder ID
 * @param {number} minAmount.query.optional - Minimum bid amount
 * @param {number} maxAmount.query.optional - Maximum bid amount
 * @param {string} startDate.query.optional - Filter bids after this date (ISO format)
 * @param {string} endDate.query.optional - Filter bids before this date (ISO format)
 * @param {number} page.query - Page number (default: 1)
 * @param {number} limit.query - Items per page (default: 10, max: 100)
 * @param {string} sort.query - Sort field and direction (format: field:asc or field:desc)
 * @returns {object} 200 - Paginated list of bids
 * @returns {Error}  default - Unexpected error
 */
router.get(
  '/',
  protect,
  admin,
  validate(bidQuerySchema.adminBidSort, 'query'),
  getAllBids
);

export default router;
