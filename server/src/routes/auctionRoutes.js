import express from 'express';
import { protect, admin } from '../middleware/authMiddleware.js';
import { uploadAuctionImagesMiddleware } from '../middleware/uploadMiddleware.js';
import {
  createAuction,
  getPublicAuctions,
  getAuctions,
  getAdminAuctions,
  getMyAuctions,
  getAuctionById,
  updateAuction,
  deleteAuction,
  confirmPayment,
  confirmDelivery,
} from '../controllers/auctionController.js';
import { validate } from '../middleware/validationMiddleware.js';
import { auctionSchema, idSchema, auctionQuerySchema } from '../utils/validators.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Auctions
 *   description: Auction management
 */

/**
 * @swagger
 * /api/v1/auctions:
 *   get:
 *     tags: [Auctions]
 *     summary: Retrieve a paginated list of public auctions
 *     description: Fetch auctions with optional filters (no auth needed)
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [upcoming, active, ended, sold]
 *         description: Filter auctions by status
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [Electronics, Fashion, Home & Garden, Collectibles, Sports, Automotive, Art, Books, Jewelry, Toys]
 *         description: Filter auctions by category
 *       - in: query
 *         name: location
 *         schema:
 *           type: string
 *           enum: [Ahafo, Ashanti, Bono, Bono East, Central, Eastern, Greater Accra, North East, Northern, Oti, Savannah, Upper East, Upper West, Volta, Western, Western North]
 *         description: Filter auctions by location
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search title or description
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [title, description, startingPrice, currentPrice, endDate, createdAt, bidCount]
 *         description: Field to sort by
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort order
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *           minimum: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           maximum: 100
 *         description: Items per page
 *       - in: query
 *         name: minPrice
 *         schema:
 *           type: number
 *           minimum: 0
 *         description: Minimum price filter
 *       - in: query
 *         name: maxPrice
 *         schema:
 *           type: number
 *           minimum: 0
 *         description: Maximum price filter
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *           example: 2025-01-01T00:00:00.000Z
 *         description: Filter auctions starting on or after this date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *           example: 2030-01-01T00:00:00.000Z
 *         description: Filter auctions ending on or before this date
 *     responses:
 *       200:
 *         description: List of auctions
 *       400:
 *         description: Invalid query parameters
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (non-admin users)
 */
router.get('/', validate(auctionQuerySchema.allAuctionSearch, 'query'), getPublicAuctions);


/**
 * @swagger
 * /api/v1/auctions/admin-auctions:
 *   get:
 *     tags: [Auctions]
 *     summary: List all auctions created by admin users
 *     description: Retrieve a paginated list of auctions where the seller is an admin. Supports all auction filters and bidCount sorting.
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [upcoming, active, ended, sold, completed, cancelled, all]
 *         description: Filter auctions by status
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [Electronics, Fashion, Home & Garden, Collectibles, Sports, Automotive, Art, Books, Jewelry, Toys]
 *         description: Filter auctions by category
*       - in: query
 *         name: location
 *         schema:
 *           type: string
 *           enum: [Ahafo, Ashanti, Bono, Bono East, Central, Eastern, Greater Accra, North East, Northern, Oti, Savannah, Upper East, Upper West, Volta, Western, Western North]
 *         description: Filter auctions by location
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search auctions by title or description
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [createdAt, currentPrice, endDate, bidCount]
 *         description: Sort by field (supports bidCount)
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *         description: Sort order
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Results per page
 *       - in: query
 *         name: fields
 *         schema:
 *           type: string
 *         description: Comma-separated fields to include
 *     responses:
 *       200:
 *         description: List of admin-created auctions
 *       400:
 *         description: Invalid query parameters
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (non-admin users)
 */
router.get('/admin-auctions', validate(auctionQuerySchema.auctionSearch, 'query'), getAdminAuctions);


/**
 * @swagger
 * /api/v1/auctions/me:
 *   get:
 *     tags: [Auctions]
 *     summary: List auctions created by the current user
 *     security:
 *       - bearerAuth: []
 *     description: Retrieve a paginated list of auctions where the authenticated user is the seller. Supports all auction filters and bidCount sorting.
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [upcoming, active, ended, sold, completed, cancelled, all]
 *         description: Filter auctions by status
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [Electronics, Fashion, Home & Garden, Collectibles, Sports, Automotive, Art, Books, Jewelry, Toys]
 *         description: Filter auctions by category
 *       - in: query
 *         name: location
 *         schema:
 *           type: string
 *           enum: [Ahafo, Ashanti, Bono, Bono East, Central, Eastern, Greater Accra, North East, Northern, Oti, Savannah, Upper East, Upper West, Volta, Western, Western North]
 *         description: Filter auctions by location
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search auctions by title or description
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [createdAt, currentPrice, endDate, bidCount]
 *         description: Sort by field (supports bidCount)
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *         description: Sort order
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Results per page
 *       - in: query
 *         name: fields
 *         schema:
 *           type: string
 *         description: Comma-separated fields to include
 *     responses:
 *       200:
 *         description: List of user's auctions
 *       400:
 *         description: Invalid query parameters
 *       401:
 *         description: Unauthorized
 */
router.get('/me', protect, validate(auctionQuerySchema.auctionSearch, 'query'), getMyAuctions);


/**
 * @swagger
 * /api/v1/auctions/admin:
 *   get:
 *     tags: [Auctions]
 *     summary: Retrieve a paginated list of auctions (admin view)
 *     security:
 *       - bearerAuth: []
 *     description: Fetch all auctions with optional filters (admin access required)
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [upcoming, active, ended, sold, completed, cancelled, all]
 *         description: Filter auctions by status
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [Electronics, Fashion, Home & Garden, Collectibles, Sports, Automotive, Art, Books, Jewelry, Toys]
 *         description: Filter auctions by Category
 *       - in: query
 *         name: location
 *         schema:
 *           type: string
 *           enum: [Ahafo, Ashanti, Bono, Bono East, Central, Eastern, Greater Accra, North East, Northern, Oti, Savannah, Upper East, Upper West, Volta, Western, Western North]
 *         description: Filter auctions by location
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search title or description
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [title, description, startingPrice, currentPrice, endDate, createdAt, bidCount]
 *         description: Field to sort by
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort order
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *           minimum: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           maximum: 100
 *         description: Items per page
 *       - in: query
 *         name: minPrice
 *         schema:
 *           type: number
 *           minimum: 0
 *         description: Minimum price filter
 *       - in: query
 *         name: maxPrice
 *         schema:
 *           type: number
 *           minimum: 0
 *         description: Maximum price filter
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *           example: 2025-01-01T00:00:00.000Z
 *         description: Filter auctions starting on or after this date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *           example: 2030-01-01T00:00:00.000Z
 *         description: Filter auctions ending on or before this date
 *     responses:
 *       200:
 *         description: List of auctions (including soft-deleted)
 *       400:
 *         description: Invalid query parameters
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (non-admin users)
 */
router.get(
  '/admin',
  protect,
  admin,
  validate(auctionQuerySchema.allAuctionSearch, 'query'),
  getAuctions
);


/**
 * @swagger
 * /api/v1/auctions/create-auction:
 *   post:
 *     tags: [Auctions]
 *     summary: Create a new auction
 *     security:
 *       - bearerAuth: []
 *     description: Create a new auction with images (authentication required)
 *     consumes:
 *       - multipart/form-data
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - description
 *               - startingPrice
 *               - bidIncrement
 *               - startDate
 *               - endDate
 *               - category
 *               - location
 *               - images
 *             properties:
 *               title:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 100
 *                 example: "Premium Smart Watch"
 *               description:
 *                 type: string
 *                 minLength: 10
 *                 maxLength: 5000
 *                 example: "Brand new smart watch with all the latest features..."
 *               startingPrice:
 *                 type: number
 *                 minimum: 1
 *                 example: 100
 *               bidIncrement:
 *                 type: number
 *                 minimum: 0.01
 *                 example: 5
 *               startDate:
 *                 type: string
 *                 format: date-time
 *                 example: "2025-11-15T10:00:00Z"
 *                 description: Must be in the future
 *               endDate:
 *                 type: string
 *                 format: date-time
 *                 example: "2025-11-20T10:00:00Z"
 *                 description: Must be after startDate
 *               category:
 *                 type: string
 *                 enum: [Electronics, Fashion, Home & Garden, Collectibles, Sports, Automotive, Art, Books, Jewelry, Toys]
 *               location:
 *                 type: string
 *                 enum: [Ahafo, Ashanti, Bono, Bono East, Central, Eastern, Greater Accra, North East, Northern, Oti, Savannah, Upper East, Upper West, Volta, Western, Western North]
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 minItems: 1
 *                 maxItems: 5
 *                 description: Images for the auction
 *     responses:
 *       201:
 *         description: Auction created successfully
 *       400:
 *         description: Validation failed (invalid data)
 *       401:
 *         description: Unauthorized
 *       413:
 *         description: File too large
 *       415:
 *         description: Unsupported media type
 *       500:
 *         description: Server error
 */
router.post(
  '/create-auction',
  protect,
  uploadAuctionImagesMiddleware,
  validate(auctionSchema.create, 'body'),
  createAuction
);

/**
 * @swagger
 * /api/v1/auctions/{auctionId}:
 *   get:
 *     tags: [Auctions]
 *     summary: Get an auction by ID
 *     parameters:
 *       - in: path
 *         name: auctionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Unique auction ID
 *     responses:
 *       200:
 *         description: Auction details
 *       404:
 *         description: Auction not found
 *       410:
 *         description: Auction deleted
 */
router.get(
  '/:auctionId',
  validate(idSchema('auctionId'), 'params'),
  getAuctionById
);

/**
 * @swagger
 * /api/v1/auctions/{auctionId}:
 *   patch:
 *     tags: [Auctions]
 *     security:
 *       - bearerAuth: []
 *     summary: Update an auction
 *     description: Modify an existing auction (seller or admin only)
 *     parameters:
 *       - in: path
 *         name: auctionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Unique auction ID
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - description
 *               - startingPrice
 *               - bidIncrement
 *               - startDate
 *               - endDate
 *               - category
 *               - location
 *               - images
 *             properties:
 *               title:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 100
 *                 example: "Premium Smart Watch"
 *               description:
 *                 type: string
 *                 minLength: 10
 *                 maxLength: 5000
 *                 example: "Brand new smart watch with all the latest features..."
 *               startingPrice:
 *                 type: number
 *                 minimum: 1
 *                 example: 100
 *               bidIncrement:
 *                 type: number
 *                 minimum: 0.01
 *                 example: 5
 *               startDate:
 *                 type: string
 *                 format: date-time
 *                 example: "2025-11-15T10:00:00Z"
 *                 description: Must be in the future
 *               endDate:
 *                 type: string
 *                 format: date-time
 *                 example: "2025-11-20T10:00:00Z"
 *                 description: Must be after startDate
 *               category:
 *                 type: string
 *                 enum: [Electronics, Fashion, Home & Garden, Collectibles, Sports, Automotive, Art, Books, Jewelry, Toys]
 *               location:
 *                 type: string
 *                 enum: [Ahafo, Ashanti, Bono, Bono East, Central, Eastern, Greater Accra, North East, Northern, Oti, Savannah, Upper East, Upper West, Volta, Western, Western North]
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 minItems: 1
 *                 maxItems: 5
 *                 description: Images for the auction
 *     responses:
 *       200:
 *         description: Auction updated
 *       403:
 *         description: Forbidden (non-owner/non-admin)
 *       404:
 *         description: Auction not found
 *       409:
 *         description: Auction already started/ended
 *       413:
 *         description: File too large
 *       415:
 *         description: Unsupported media type
 *       500:
 *         description: Server error
 */
router.patch(
  '/:auctionId',
  protect,
  validate(idSchema('auctionId'), 'params'),
  validate(auctionSchema.update, 'body'),
  updateAuction
);

/**
 * @swagger
 * /api/v1/auctions/{auctionId}:
 *   delete:
 *     tags: [Auctions]
 *     security:
 *       - bearerAuth: []
 *     summary: Delete an auction
 *     description: Soft-delete an auction by default; add `permanent=true` to hard-delete (admin only)
 *     parameters:
 *       - in: path
 *         name: auctionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Unique auction ID
 *       - in: query
 *         name: permanent
 *         schema:
 *           type: boolean
 *         description: Set to `true` for permanent deletion
 *     responses:
 *       200:
 *         description: Auction deleted
 *       403:
 *         description: Forbidden (non-owner/non-admin)
 *       404:
 *         description: Auction not found
 */
router.delete(
  '/:auctionId',
  protect,
  validate(idSchema('auctionId'), 'params'),
  validate(auctionQuerySchema.delete, 'query'),
  deleteAuction
);

/**
 * @swagger
 * /api/v1/auctions/{auctionId}/confirm-payment:
 *   patch:
 *     tags: [Auctions]
 *     security:
 *       - bearerAuth: []
 *     summary: Confirm payment for an auction
 *     description: Mark the auction as paid (winner only)
 *     parameters:
 *       - in: path
 *         name: auctionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Unique auction ID
 *     responses:
 *       200:
 *         description: Payment confirmed
 *       403:
 *         description: Forbidden (non-winner)
 *       404:
 *         description: Auction not found or not won
 *       409:
 *         description: Payment already confirmed
 */
router.patch(
  '/:auctionId/confirm-payment',
  protect,
  validate(idSchema('auctionId'), 'params'),
  confirmPayment
);

/**
 * @swagger
 * /api/v1/auctions/{auctionId}/confirm-delivery:
 *   patch:
 *     tags: [Auctions]
 *     security:
 *       - bearerAuth: []
 *     summary: Confirm delivery for an auction
 *     description: Mark the auction as delivered (buyer only)
 *     parameters:
 *       - in: path
 *         name: auctionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Unique auction ID
 *     responses:
 *       200:
 *         description: Delivery confirmed
 *       403:
 *         description: Forbidden (non-buyer)
 *       404:
 *         description: Auction not found or not eligible
 *       409:
 *         description: Delivery already confirmed
 */
router.patch(
  '/:auctionId/confirm-delivery',
  protect,
  validate(idSchema('auctionId'), 'params'),
  confirmDelivery
);

export default router;