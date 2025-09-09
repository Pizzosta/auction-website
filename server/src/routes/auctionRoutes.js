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
 * @route GET /api/auctions
 * @group Auctions - auction management
 * @returns {object} 200 - List of auctions
 * @returns {Error}  default - Unexpected error
 */
router.get(
  '/', 
  validate(auctionQuerySchema, 'query'), 
  getAuctions
);

/**
 * @route POST /api/auctions
 * @group Auctions - auction management
 * @param {CreateAuction.model} body.body.required
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
 * @param {string} id.path.required
 * @returns {object} 200 - Auction details
 * @returns {Error}  default - Unexpected error
 */
router.get(
  '/:id', 
  validate(idSchema, 'params', { key: 'id' }), 
  getAuctionById
);

/**
 * @route PUT /api/auctions/{id}
 * @group Auctions - auction management
 * @param {string} id.path.required
 * @param {UpdateAuction.model} body.body.required
 * @returns {object} 200 - Auction updated
 * @returns {Error}  default - Unexpected error
 */
router.put(
  '/:id', 
  protect, 
  validate(idSchema, 'params', { key: 'id' }), 
  validate(auctionSchema.update, 'body'), 
  updateAuction
);

/**
 * @route DELETE /api/auctions/{id}
 * @group Auctions - auction management
 * @param {string} id.path.required
 * @returns {object} 200 - Auction deleted
 * @returns {Error}  default - Unexpected error
 */
router.delete(
  '/:id', 
  protect, 
  validate(idSchema, 'params', { key: 'id' }), 
  deleteAuction
);

export default router;
