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
import { auctionSchema, idSchema } from '../utils/validators.js';
import { uploadAuctionImagesMiddleware } from '../middleware/uploadMiddleware.js';

const router = express.Router();

// Public routes
router.get('/', getAuctions);
router.get('/:id', getAuctionById);

// Protected routes
router.post(
  '/', 
  protect, 
  uploadAuctionImagesMiddleware,
  validate(auctionSchema.create), 
  createAuction
);

router.put('/:id', protect, validate(idSchema, 'params'), validate(auctionSchema.update), updateAuction);
router.delete('/:id', protect, validate(idSchema, 'params'), deleteAuction);

export default router;
