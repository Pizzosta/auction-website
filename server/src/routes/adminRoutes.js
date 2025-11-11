import express from 'express';
import { getHotAuctions, getPrometheusMetrics } from '../controllers/adminController.js';
import { protect, admin } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * @route GET /api/admin/hot-auctions
 * @group Admin - administration
 * @description List the top contended auctions by lock timeout count. Admin only.
 * @returns {object} 200 - List of hot auctions
 * @returns {Error} default - Unexpected error
 */
router.get('/hot-auctions', protect, admin, getHotAuctions);

/**
 * @route GET /api/admin/metrics
 * @group Admin - administration
 * @description Prometheus metrics endpoint. Typically scraped by monitoring systems.
 * @returns {string} 200 - Prometheus metrics (text/plain; version=0.0.4)
 * @returns {Error} default - Unexpected error
 */
router.get('/metrics', getPrometheusMetrics);

export default router;
