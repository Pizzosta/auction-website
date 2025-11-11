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
 * @route POST /api/featured-auctions/add
 * @group FeaturedAuctions - featured auction management
 * @description Add an auction to the featured list. Requires admin privileges.
 * @param {AddFeaturedAuction.model} body.body.required
 * @returns {object} 201 - Auction added to featured list
 * @returns {Error}  default - Unexpected error
 */
router.post(
  '/add',
  protect,
  admin,
  validate(featuredAuctionSchema.add, 'body'),
  addFeaturedAuction
);

/**
 * @route DELETE /api/featured-auctions/remove
 * @group FeaturedAuctions - featured auction management
 * @description Remove an auction from the featured list. Requires admin privileges.
 *              Soft delete by default. Add `?permanent=true` (admin only) to permanently delete.
 * @param {RemoveFeaturedAuction.model} body.body.required
 * @param {boolean} permanent.query - Permanently remove the auction from featured list (admin only)
 * @returns {object} 200 - Auction removed from featured list
 * @returns {Error}  default - Unexpected error
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
 * @route GET /api/featured-auctions/admin
 * @group FeaturedAuctions - featured auction management
 * @description Get the list of all featured auctions. Requires admin privileges.
 * @returns {object} 200 - List of featured auctions
 * @returns {Error}  default - Unexpected error
 */
router.get(
  '/admin',
  protect,
  admin,
  validate(featuredAuctionQuerySchema.search, 'query'),
  getFeaturedAuctions
);

/**
 * @route GET /api/featured-auctions
 * @group FeaturedAuctions - featured auction management
 * @description Get the list of all featured auctions. Publicly accessible.
 * @returns {object} 200 - List of featured auctions
 * @returns {Error}  default - Unexpected error
 */
router.get('/', getPublicFeaturedAuctions);

/**
 * @route PATCH /api/featured-auctions/restore
 * @group FeaturedAuctions - featured auction management
 * @description Restore a previously removed featured auction. Requires admin privileges.
 * @param {RestoreFeaturedAuction.model} body.body.required
 * @returns {object} 200 - Featured auction restored
 * @returns {Error}  default - Unexpected error
 */
router.patch(
  '/restore',
  protect,
  admin,
  validate(featuredAuctionSchema.restore, 'body'),
  restoreFeaturedAuction
);

export default router;
