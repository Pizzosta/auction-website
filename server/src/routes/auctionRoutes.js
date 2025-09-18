import express from 'express';
import {
  createAuction,
  getPublicAuctions,
  getAuctions,
  getAuctionById,
  updateAuction,
  deleteAuction,
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
router.get('/', validate(auctionQuerySchema, 'query'), getPublicAuctions);

/**
 * @route GET /api/auctions/admin
 * @group Auctions - auction management
 * @description Retrieve a list of all auctions with optional filters. Requires authentication and admin role.
 * @returns {object} 200 - List of auctions
 * @returns {Error}  default - Unexpected error
 */
router.get('/admin', protect, admin, validate(auctionQuerySchema, 'query'), getAuctions);

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
  '/',
  protect,
  uploadAuctionImagesMiddleware,
  validate(auctionSchema.create, 'body'),
  createAuction
);

/**
 * @route GET /api/auctions/{id}
 * @group Auctions - auction management
 * @description Get details of a specific auction by ID.
 * @param {string} id.path.required
 * @returns {object} 200 - Auction details
 * @returns {Error}  default - Unexpected error
 */
router.get('/:id', validate(idSchema, 'params', { key: 'id' }), getAuctionById);

/**
 * @route PUT /api/auctions/{id}
 * @group Auctions - auction management
 * @description Update an auction by ID. Requires authentication.
 * @param {string} id.path.required
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
  '/:id',
  protect,
  validate(idSchema, 'params', { key: 'id' }),
  validate(auctionSchema.update, 'body'),
  updateAuction
);

/**
 * @route DELETE /api/auctions/{id}
 * @group Auctions - auction management
 * @description Delete an auction by ID. Requires authentication.
 * @param {string} id.path.required
 * @returns {object} 200 - Auction deleted
 * @returns {Error}  default - Unexpected error
 */
router.delete('/:id', protect, validate(idSchema, 'params', { key: 'id' }), deleteAuction);

export default router;
