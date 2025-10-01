import express from 'express';
import { protect, admin } from '../middleware/authMiddleware.js';
import { getSystemStats, getAuctionStats, getUserStats, getBidStats } from '../controllers/statsController.js';
import { validate } from '../middleware/validationMiddleware.js';
import { statsQuerySchema, auctionStatsQuerySchema, userStatsQuerySchema, bidStatsQuerySchema } from '../utils/validators.js';

const router = express.Router();

// Get system-wide statistics
router.get('/', protect, admin, validate(statsQuerySchema), getSystemStats);

// Get auction statistics
router.get('/auctions', protect, admin, validate(auctionStatsQuerySchema), getAuctionStats);

// Get user statistics
router.get('/users', protect, admin, validate(userStatsQuerySchema), getUserStats);

// Get bid statistics
router.get('/bids', protect, admin, validate(bidStatsQuerySchema), getBidStats);

// Future admin-only stats endpoints can be added here
// Example:
// router.get('/admin/insights', getAdminInsights);

export default router;
