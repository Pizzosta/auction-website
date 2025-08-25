import express from 'express';
import { placeBid, getBidsByAuction, getMyBids } from '../controllers/bidController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Public routes
router.get('/auction/:auctionId', getBidsByAuction);

// Protected routes
router.post('/', protect, placeBid);
router.get('/my-bids', protect, getMyBids);

export default router;
