import express from 'express';
import {
  createAuction,
  getPublicAuctions,
  getAuctions,
  getAuctionById,
  updateAuction,
  deleteAuction,
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
 * @group Auctions - Auction Management
 * @description Retrieve a paginated list of auctions with optional filtering and sorting.
 * @header {string} Accept - application/json
 * @param {string} status.query.optional - Filter by status (active, upcoming, ended, cancelled, all)
 * @param {string} category.query.optional - Filter by category ID
 * @param {string} search.query.optional - Search query for title or description
 * @param {string} sort.query.optional - Sort field (createdAt, endDate, currentPrice)
 * @param {string} order.query.optional - Sort order (asc, desc). Default: desc
 * @param {number} page.query.optional - Page number for pagination. Default: 1
 * @param {number} limit.query.optional - Number of items per page. Default: 10, Max: 100
 * @returns {object} 200 - Paginated list of auctions
 * @returns {Error} 400 - Invalid query parameters
 * @returns {Error} 500 - Internal server error
 */
router.get('/', validate(auctionQuerySchema.search, 'query'), getPublicAuctions);

/**
 * @route GET /api/auctions/admin
 * @group Auctions - Auction Management [Admin]
 * @description Retrieve a paginated list of all auctions with optional filters. Requires admin privileges.
 * @header {string} Authorization - Bearer token for authentication
 * @param {string} status.query.optional - Filter by status (active, upcoming, ended, cancelled, all)
 * @param {string} category.query.optional - Filter by category ID
 * @param {string} search.query.optional - Search query for title or description
 * @param {string} sort.query.optional - Sort field (createdAt, endDate, currentPrice)
 * @param {string} order.query.optional - Sort order (asc, desc). Default: desc
 * @param {number} page.query.optional - Page number for pagination. Default: 1
 * @param {number} limit.query.optional - Number of items per page. Default: 10, Max: 100
 * @param {boolean} includeDeleted.query.optional - Include deleted auctions. Default: false
 * @returns {object} 200 - Paginated list of auctions including deleted ones if requested
 * @returns {Error} 401 - Unauthorized
 * @returns {Error} 403 - Forbidden (not an admin)
 * @returns {Error} 500 - Internal server error
 */
router.get('/admin', protect, admin, validate(auctionQuerySchema.search, 'query'), getAuctions);

/**
 * @route POST /api/auctions/create-auction
 * @group Auctions - Auction Management
 * @description Create a new auction with uploaded images. Requires authentication.
 * @header {string} Authorization - Bearer token for authentication
 * @header {string} Content-Type - multipart/form-data
 * @param {string} title.formData.required - Title of the auction (3-100 characters)
 * @param {string} description.formData.required - Detailed description of the auction (10-5000 characters)
 * @param {number} startingPrice.formData.required - Starting price (minimum 1)
 * @param {number} bidIncrement.formData.required - Bid increment (minimum 0.01)
 * @param {string} startDate.formData.required - ISO 8601 date string for auction start (future date)
 * @param {string} endDate.formData.required - ISO 8601 date string for auction end (must be after start date)
 * @param {string} category.formData.required - Category this auction belongs to
 * @param {file[]} images.formData.required - Auction images (1-5 images, JPG/JPEG/PNG/WEBP, max 5MB each)
 * @returns {object} 201 - Auction created successfully
 * @returns {Error} 400 - Invalid input data or validation error
 * @returns {Error} 401 - Unauthorized
 * @returns {Error} 413 - File size too large
 * @returns {Error} 415 - Unsupported media type
 * @returns {Error} 500 - Failed to process upload
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
 * @group Auctions - Auction Management
 * @description Get detailed information about a specific auction by its ID.
 * @param {string} auctionId.path.required - The unique identifier of the auction
 * @returns {object} 200 - Auction details including images, bids, and seller information
 * @returns {Error} 400 - Invalid auction ID format
 * @returns {Error} 404 - Auction not found or not available
 * @returns {Error} 410 - Auction has been deleted
 * @returns {Error} 500 - Internal server error
 */
router.get('/:auctionId', validate(idSchema('auctionId'), 'params'), getAuctionById);

/**
 * @route PATCH /api/auctions/{auctionId}
 * @group Auctions - Auction Management
 * @description Update an existing auction. Only the auction creator or admin can update.
 * @header {string} Authorization - Bearer token for authentication
 * @header {string} Content-Type - application/json or multipart/form-data
 * @param {string} auctionId.path.required - The ID of the auction to update
 * @param {string} title.formData.optional - Updated title (3-100 characters)
 * @param {string} description.formData.optional - Updated description (10-5000 characters)
 * @param {number} startingPrice.formData.optional - Updated starting price (minimum 1)
 * @param {number} bidIncrement.formData.optional - Updated bid increment (minimum 0.01)
 * @param {string} startDate.formData.optional - New start date (ISO 8601, future date)
 * @param {string} endDate.formData.optional - New end date (must be after start date)
 * @param {string} category.formData.optional - New category
 * @param {string} status.formData.optional - New status (draft, active, cancelled)
 * @param {file[]} images.formData.optional - New images to add (JPG/JPEG/PNG/WEBP, max 5MB each)
 * @param {string[]} imagesToRemove.formData.optional - Array of image IDs to remove
 * @returns {object} 200 - Auction updated successfully
 * @returns {Error} 400 - Invalid input data or validation error
 * @returns {Error} 401 - Unauthorized
 * @returns {Error} 403 - Forbidden (not the auction owner or admin)
 * @returns {Error} 404 - Auction not found
 * @returns {Error} 409 - Auction cannot be modified (already started/ended)
 * @returns {Error} 413 - File size too large
 * @returns {Error} 500 - Internal server error
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
 * @group Auctions - Auction Management
 * @description Delete an auction by ID. Soft delete by default, or permanently if specified.
 * @header {string} Authorization - Bearer token for authentication
 * @param {string} auctionId.path.required - The ID of the auction to delete
 * @param {boolean} permanent.query.optional - If true, permanently deletes the auction (admin only)
 * @returns {object} 200 - Auction deleted successfully
 * @returns {Error} 400 - Invalid auction ID
 * @returns {Error} 401 - Unauthorized
 * @returns {Error} 403 - Forbidden (not the auction owner or admin)
 * @returns {Error} 404 - Auction not found
 * @returns {Error} 409 - Cannot delete auction with active bids
 * @returns {Error} 500 - Internal server error
 */
router.delete(
  '/:auctionId',
  protect,
  validate(idSchema('auctionId'), 'params'),
  validate(auctionQuerySchema.delete, 'query'),
  deleteAuction
);

/**
 * @route PATCH /api/auctions/{auctionId}/confirm-payment
 * @group Auctions - Payment Management
 * @description Confirm payment for a winning auction bid. Only the auction winner can confirm payment.
 * @header {string} Authorization - Bearer token for authentication
 * @param {string} auctionId.path.required - The ID of the auction to confirm payment for
 * @param {string} paymentMethod.body.required - Payment method used (e.g., 'credit_card', 'paypal')
 * @param {string} transactionId.body.required - External transaction ID from payment processor
 * @param {number} amount.body.required - Amount paid (must match winning bid amount)
 * @returns {object} 200 - Payment confirmed successfully
 * @returns {Error} 400 - Invalid payment details
 * @returns {Error} 401 - Unauthorized
 * @returns {Error} 403 - Not the auction winner
 * @returns {Error} 404 - Auction not found or not won
 * @returns {Error} 409 - Payment already confirmed
 * @returns {Error} 500 - Payment processing error
 */
router.patch(
  '/:auctionId/confirm-payment',
  protect,
  validate(idSchema('auctionId'), 'params'),
  confirmPayment
);

/**
 * @route PATCH /api/auctions/{auctionId}/confirm-delivery
 * @group Auctions - Delivery Management
 * @description Confirm delivery of the auction item. Only the buyer can confirm delivery.
 * @header {string} Authorization - Bearer token for authentication
 * @param {string} auctionId.path.required - The ID of the auction to confirm delivery for
 * @param {string} trackingNumber.body.optional - Delivery tracking number
 * @param {string} receivedDate.body.required - ISO 8601 date when the item was received
 * @param {string} condition.body.required - Condition of received item (e.g., 'as_described', 'damaged')
 * @param {string} notes.body.optional - Additional notes about the delivery
 * @returns {object} 200 - Delivery confirmed successfully
 * @returns {Error} 400 - Invalid delivery details
 * @returns {Error} 401 - Unauthorized
 * @returns {Error} 403 - Not the buyer of this auction
 * @returns {Error} 404 - Auction not found or not eligible
 * @returns {Error} 409 - Delivery already confirmed
 * @returns {Error} 500 - Internal server error
 */
router.patch(
  '/:auctionId/confirm-delivery',
  protect,
  validate(idSchema('auctionId'), 'params'),
  confirmDelivery
);

export default router;
