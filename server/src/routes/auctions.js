import express from 'express';
import {
  createAuction,
  getAuctions,
  getAuctionById,
  updateAuction,
  deleteAuction,
} from '../controllers/auctionController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Public routes
router.get('/', getAuctions);
router.get('/:id', getAuctionById);

// Protected routes
router.post('/', protect, createAuction);
router.put('/:id', protect, updateAuction);
router.delete('/:id', protect, deleteAuction);

export default router;
