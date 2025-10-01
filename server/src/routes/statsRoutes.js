import express from 'express';
import { protect, admin } from '../middleware/authMiddleware.js';
import { getSystemStats, getAuctionStats, getUserStats, getBidStats } from '../controllers/statsController.js';

const router = express.Router();

// Get system-wide statistics
router.get('/', protect, admin, getSystemStats);

// Get auction statistics
router.get('/auctions', protect, admin, getAuctionStats);

// Get user statistics
router.get('/users', protect, admin, getUserStats);

// Get bid statistics
router.get('/bids', protect, admin, getBidStats);

// Future admin-only stats endpoints can be added here
// Example:
// router.get('/admin/insights', getAdminInsights);

export default router;
