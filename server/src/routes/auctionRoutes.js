import express from 'express';
import {
  createAuction,
  getAuctions,
  getAuctionById,
  updateAuction,
  deleteAuction,
} from '../controllers/auctionController.js';
import { protect } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validationMiddleware.js';
import { auctionValidation } from '../utils/validators.js';

const router = express.Router();

// Public routes
router.get('/', getAuctions);
router.get('/:id', getAuctionById);

// Protected routes
router.post('/', protect, validate(auctionValidation.create), createAuction);
router.put('/:id', protect, validate(auctionValidation.update), updateAuction);
router.delete('/:id', protect, deleteAuction);

export default router;
