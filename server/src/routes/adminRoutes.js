import express from 'express';
import { getHotAuctions, getPrometheusMetrics } from '../controllers/adminController.js';
import { protect, admin } from '../middleware/authMiddleware.js';

const router = express.Router();

// Admin-only: list top contended auctions by lock timeout count
router.get('/hot-auctions', protect, admin, getHotAuctions);

// Prometheus metrics endpoint (commonly scraped without auth). If you want auth, add protect/admin.
router.get('/metrics', getPrometheusMetrics);

export default router;
