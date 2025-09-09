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
