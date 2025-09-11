import express from 'express';
import {
  placeBid,
  getBidsByAuction,
  getMyBids,
  deleteBid,
  restoreBid,
} from '../controllers/bidController.js';
import { protect } from '../middleware/authMiddleware.js';
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
  [validate(idSchema, 'params', { key: 'auctionId' }), validate(bidQuerySchema, 'query')],
  getBidsByAuction
);

/**
 * @route GET /api/bids/me
 * @group Bids - bid management
 * @description Get all bids placed by the currently authenticated user.
 * @returns {object} 200 - List of user's bids
 * @returns {Error}  default - Unexpected error
 */
router.get('/me', protect, validate(bidQuerySchema, 'query'), getMyBids);

/**
 * @route DELETE /api/bids/{bidId}
 * @group Bids - bid management
 * @description Delete a bid (soft delete by default, permanent delete for admins with query param)
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
  validate(idSchema, 'params', { key: 'bidId' }),
  validate(bidSchema.delete, 'query'),
  deleteBid
);

/**
 * @route POST /api/bids/{bidId}/restore
 * @group Bids - bid management
 * @description Restore a soft-deleted bid (admin only)
 * @param {string} bidId.path.required - The ID of the bid to restore
 * @returns {object} 200 - Bid restored successfully
 * @returns {Error} 403 - Not authorized
 * @returns {Error} 404 - Bid not found or not deleted
 * @returns {Error} default - Unexpected error
 */
router.post('/:bidId/restore', protect, validate(idSchema, 'params', { key: 'bidId' }), restoreBid);

export default router;
