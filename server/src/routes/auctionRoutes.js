import express from 'express';
import {
  createAuction,
  getAuctions,
  getAuctionById,
  updateAuction,
  deleteAuction
} from '../controllers/auctionController.js';
import { protect } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validationMiddleware.js';
import { auctionSchema, idSchema, auctionQuerySchema } from '../utils/validators.js';
import { uploadAuctionImagesMiddleware } from '../middleware/uploadMiddleware.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Auctions
 *   description: Auction management
 */

/**
 * @swagger
 * /api/auctions:
 *   get:
 *     summary: Get all auctions
 *     tags: [Auctions]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Number of auctions per page
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *         description: Sort order
 *     responses:
 *       200:
 *         description: List of auctions
 *
 *   post:
 *     summary: Create a new auction
 *     security:
 *       - bearerAuth: []
 *     tags:
 *       - Auctions
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateAuction'
 *     responses:
 *       201:
 *         description: Auction created
 *       400:
 *         description: Validation error
 */

/**
 * @swagger
 * /api/auctions/{id}:
 *   get:
 *     summary: Get auction by ID
 *     tags: [Auctions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Auction ID
 *     responses:
 *       200:
 *         description: Auction details
 *       404:
 *         description: Auction not found
 *
 *   put:
 *     summary: Update auction
 *     tags: [Auctions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Auction ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateAuction'
 *     responses:
 *       200:
 *         description: Auction updated
 *       400:
 *         description: Validation error
 *       404:
 *         description: Auction not found
 *
 *   delete:
 *     summary: Delete auction
 *     tags: [Auctions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Auction ID
 *     responses:
 *       200:
 *         description: Auction deleted
 *       404:
 *         description: Auction not found
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     CreateAuction:
 *       type: object
 *       required:
 *         - title
 *         - description
 *         - startingPrice
 *         - endDate
 *         - category
 *       properties:
 *         title:
 *           type: string
 *           example: "Vintage Watch"
 *         description:
 *           type: string
 *           example: "A rare vintage watch from 1960."
 *         startingPrice:
 *           type: number
 *           example: 100
 *         currentPrice:
 *           type: number
 *           example: 150
 *         endDate:
 *           type: string
 *           format: date-time
 *           example: "2025-12-31T23:59:59Z"
 *         category:
 *           type: string
 *           example: "Collectibles"
 *         images:
 *           type: array
 *           items:
 *             type: string
 *             format: uri
 *           example: ["https://example.com/image1.jpg"]
 *     UpdateAuction:
 *       type: object
 *       properties:
 *         title:
 *           type: string
 *         description:
 *           type: string
 *         startingPrice:
 *           type: number
 *         currentPrice:
 *           type: number
 *         endDate:
 *           type: string
 *           format: date-time
 *         category:
 *           type: string
 *         images:
 *           type: array
 *           items:
 *             type: string
 *             format: uri
 */

// Public routes
router.get(
  '/', 
  validate(auctionQuerySchema, 'query'), 
  getAuctions
);

router.get(
  '/:id', 
  validate(idSchema, 'params', { key: 'id' }), 
  getAuctionById
);

// Protected routes
router.post(
  '/', 
  protect, 
  uploadAuctionImagesMiddleware,
  validate(auctionSchema.create, 'body'), 
  createAuction
);

router.put(
  '/:id', 
  protect, 
  validate(idSchema, 'params', { key: 'id' }), 
  validate(auctionSchema.update, 'body'), 
  updateAuction
);

router.delete(
  '/:id', 
  protect, 
  validate(idSchema, 'params', { key: 'id' }), 
  deleteAuction
);

export default router;
