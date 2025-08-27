import express from 'express';
import { placeBid, getBidsByAuction, getMyBids } from '../controllers/bidController.js';
import { protect } from '../middleware/authMiddleware.js';
import { bidValidation } from '../utils/validators.js';
import { validate } from '../middleware/validationMiddleware.js';

const router = express.Router();

// Public routes
router.get('/auction/:auctionId', getBidsByAuction);

// Protected routes
router.post('/', protect, validate(bidValidation), placeBid);
router.get('/my-bids', protect, getMyBids);

export default router;
