import express from 'express';
import {
  createAuction,
  getPublicAuctions,
  getAuctions,
  getAuctionById,
  updateAuction,
  deleteAuction,
  restoreAuction,
  confirmPayment,
  confirmDelivery,
} from '../controllers/auctionController.js';
import { protect, admin } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validationMiddleware.js';
import { auctionSchema, idSchema, auctionQuerySchema } from '../utils/validators.js';
import { uploadAuctionImagesMiddleware } from '../middleware/uploadMiddleware.js';

const router = express.Router();

/**
 * @route GET /api/auctions
 * @group Auctions - auction management
 * @description Retrieve a list of all auctions with optional filters.
 * @returns {object} 200 - List of auctions
 * @returns {Error}  default - Unexpected error
 */
router.get('/', validate(auctionQuerySchema.search, 'query'), getPublicAuctions);

/**
 * @route GET /api/auctions/admin
 * @group Auctions - auction management
 * @description Retrieve a list of all auctions with optional filters. Requires authentication and admin role.
 * @returns {object} 200 - List of auctions
 * @returns {Error}  default - Unexpected error
 */
router.get('/admin', protect, admin, validate(auctionQuerySchema.search, 'query'), getAuctions);

/**
 * @route POST /api/auctions
 * @group Auctions - auction management
 * @description Create a new auction. Requires authentication and image upload.
 * @param {CreateAuction.model} body.body.required
 * @param {string} title.body.required - Title of the auction
 * @param {string} description.body.required - Description of the auction
 * @param {number} startingPrice.body.required - Starting price for the auction
 * @param {string} startDate.body.required - ISO date string for auction start
 * @param {string} endDate.body.required - ISO date string for auction end
 * @param {file} images.formData.required - Up to 5 images (JPG/JPEG/PNG/WEBP, max 5MB each)
 * @returns {object} 201 - Auction created
 * @returns {Error}  default - Unexpected error
 */
router.post(
  '/create-auction',
  protect,
  uploadAuctionImagesMiddleware,
  validate(auctionSchema.create, 'body'),
  createAuction
);

/**
 * @route GET /api/auctions/{auctionId}
 * @group Auctions - auction management
 * @description Get details of a specific auction by ID.
 * @param {string} auctionId.path.required
 * @returns {object} 200 - Auction details
 * @returns {Error}  default - Unexpected error
 */
router.get('/:auctionId', validate(idSchema('auctionId'), 'params'), getAuctionById);

/**
 * @route PUT /api/auctions/{auctionId}
 * @group Auctions - auction management
 * @description Update an auction by ID. Requires authentication.
 * @param {string} auctionId.path.required
 * @param {UpdateAuction.model} body.body.required
 * @param {string} title.body.optional - Title of the auction
 * @param {string} description.body.optional - Description of the auction
 * @param {number} startingPrice.body.optional - Starting price for the auction
 * @param {string} startDate.body.optional - ISO date string for auction start
 * @param {string} endDate.body.optional - ISO date string for auction end
 * @param {file} images.formData.optional - Up to 5 images (JPG/JPEG/PNG/WEBP, max 5MB each)
 * @returns {object} 200 - Auction updated
 * @returns {Error}  default - Unexpected error
 */
router.patch(
  '/:auctionId',
  protect,
  validate(idSchema('auctionId'), 'params'),
  validate(auctionSchema.update, 'body'),
  updateAuction
);

/**
 * @route DELETE /api/auctions/{auctionId}
 * @group Auctions - auction management
 * @description Delete an auction by ID. Requires authentication.
 * @param {string} auctionId.path.required
 * @param {DeleteAuction.model} body.body.required
 * @param {boolean} permanent.body.optional - Permanently delete the auction
 * @returns {object} 200 - Auction deleted
 * @returns {Error}  default - Unexpected error
 */
router.delete('/:auctionId', protect, validate(idSchema('auctionId'), 'params'), validate(auctionQuerySchema.delete, 'query'), deleteAuction);

/**
 * @route PATCH /api/auctions/{auctionId}/restore
 * @group Auctions - auction management
 * @description Restore a soft-deleted auction. Requires authentication and admin role.
 * @param {string} auctionId.path.required
 * @returns {object} 200 - Auction restored
 * @returns {Error}  default - Unexpected error
 */
router.patch('/:auctionId/restore', protect, admin, validate(idSchema('auctionId'), 'params'), restoreAuction);

/**
 * @route PATCH /api/auctions/{auctionId}/confirm-payment
 * @group Auctions - auction management
 * @description Confirm payment for an auction. Requires authentication.
 * @param {string} auctionId.path.required
 * @returns {object} 200 - Payment confirmed
 * @returns {Error}  default - Unexpected error
 */
router.patch('/:auctionId/confirm-payment', protect, validate(idSchema('auctionId'), 'params'), confirmPayment);

/**
 * @route PATCH /api/auctions/{auctionId}/confirm-delivery
 * @group Auctions - auction management
 * @description Confirm delivery for an auction. Requires authentication.
 * @param {string} auctionId.path.required
 * @returns {object} 200 - Delivery confirmed
 * @returns {Error}  default - Unexpected error
 */
router.patch('/:auctionId/confirm-delivery', protect, validate(idSchema('auctionId'), 'params'), confirmDelivery);

export default router;
