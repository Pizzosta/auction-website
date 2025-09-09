import express from 'express';
import { placeBid, getBidsByAuction, getMyBids } from '../controllers/bidController.js';
import { protect } from '../middleware/authMiddleware.js';
import { bidSchema, idSchema, bidQuerySchema } from '../utils/validators.js';
import { validate } from '../middleware/validationMiddleware.js';
import { bidLimiter } from '../middleware/security.js';

const router = express.Router();

/**
 * @route POST /api/bids
 * @group Bids - bid management
 * @param {PlaceBid.model} body.body.required
 * @returns {object} 201 - Bid placed
 * @returns {Error}  default - Unexpected error
 */
router.post(
  '/', 
  protect,
  bidLimiter, 
  validate(bidSchema.create, 'body'), 
  placeBid
);

/**
 * @route GET /api/bids/auction/{auctionId}
 * @group Bids - bid management
 * @param {string} auctionId.path.required
 * @returns {object} 200 - List of bids for auction
 * @returns {Error}  default - Unexpected error
 */
router.get(
  '/auction/:auctionId',
  validate(idSchema, 'params', { key: 'auctionId' }),
  validate(bidQuerySchema, 'query'),
  getBidsByAuction
);

/**
 * @route GET /api/bids/me
 * @group Bids - bid management
 * @returns {object} 200 - List of user's bids
 * @returns {Error}  default - Unexpected error
 */
router.get(
  '/me',
  protect,
  validate(bidQuerySchema, 'query'),
  getMyBids
);

export default router;
