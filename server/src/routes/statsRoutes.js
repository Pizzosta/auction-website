import express from 'express';
import { protect, admin } from '../middleware/authMiddleware.js';
import {
  getSystemStats,
  getAuctionStats,
  getUserStats,
  getBidStats,
  getSocketStatsController,
  getSocketRoomsController,
} from '../controllers/statsController.js';
import { validate } from '../middleware/validationMiddleware.js';
import { statsQuerySchema } from '../utils/validators.js';

const router = express.Router();

/**
 * @route GET /api/stats
 * @group Statistics - System and application statistics
 * @description Get comprehensive system-wide statistics. Requires admin authentication.
 * @header {string} Authorization - Bearer token for authentication
 * @param {string} timeFrame.query - Time frame for statistics (day, week, month, year, all). Default: month
 * @returns {object} 200 - System statistics
 * @property {object} system - System information
 * @property {object} users - User statistics
 * @property {object} auctions - Auction statistics
 * @property {object} bids - Bid statistics
 * @property {object} performance - Performance metrics
 * @returns {Error} 401 - Unauthorized
 * @returns {Error} 403 - Forbidden (admin access required)
 * @returns {Error} 500 - Internal server error
 */
router.get('/', protect, admin, validate(statsQuerySchema), getSystemStats);

/**
 * @route GET /api/stats/auctions
 * @group Statistics - Auction statistics
 * @description Get detailed auction statistics. Requires admin authentication.
 * @header {string} Authorization - Bearer token for authentication
 * @param {string} timeFrame.query - Time frame for statistics (day, week, month, year, all). Default: month
 * @returns {object} 200 - Auction statistics
 * @property {number} totalAuctions - Total number of auctions
 * @property {number} activeAuctions - Number of currently active auctions
 * @property {number} endedAuctions - Number of ended auctions
 * @property {number} newAuctions - Number of new auctions in the specified time frame
 * @property {object} byCategory - Auction count by category
 * @property {object} byStatus - Auction count by status
 * @property {object} priceStats - Price statistics (min, max, avg)
 * @returns {Error} 401 - Unauthorized
 * @returns {Error} 403 - Forbidden (admin access required)
 * @returns {Error} 500 - Internal server error
 */
router.get('/auctions', protect, admin, validate(statsQuerySchema), getAuctionStats);

/**
 * @route GET /api/stats/users
 * @group Statistics - User statistics
 * @description Get detailed user statistics. Requires admin authentication.
 * @header {string} Authorization - Bearer token for authentication
 * @param {string} timeFrame.query - Time frame for statistics (day, week, month, year, all). Default: month
 * @returns {object} 200 - User statistics
 * @property {number} totalUsers - Total number of users
 * @property {number} activeUsers - Number of active users
 * @property {number} newUsers - Number of new users in the specified time frame
 * @property {object} byRole - User count by role
 * @property {object} byRegistrationSource - User count by registration source
 * @property {number} avgAuctionsPerUser - Average number of auctions per user
 * @property {number} avgBidsPerUser - Average number of bids per user
 * @returns {Error} 401 - Unauthorized
 * @returns {Error} 403 - Forbidden (admin access required)
 * @returns {Error} 500 - Internal server error
 */
router.get('/users', protect, admin, validate(statsQuerySchema), getUserStats);

/**
 * @route GET /api/stats/bids
 * @group Statistics - Bid statistics
 * @description Get detailed bid statistics. Requires admin authentication.
 * @header {string} Authorization - Bearer token for authentication
 * @param {string} timeFrame.query - Time frame for statistics (day, week, month, year, all). Default: month
 * @returns {object} 200 - Bid statistics
 * @property {number} totalBids - Total number of bids
 * @property {number} bidsToday - Number of bids placed today
 * @property {number} avgBidsPerAuction - Average number of bids per auction
 * @property {object} byHour - Bid count by hour of day
 * @property {object} byDay - Bid count by day of week
 * @property {number} highestBid - Highest bid amount
 * @property {number} avgBidAmount - Average bid amount
 * @returns {Error} 401 - Unauthorized
 * @returns {Error} 403 - Forbidden (admin access required)
 * @returns {Error} 500 - Internal server error
 */
router.get('/bids', protect, admin, validate(statsQuerySchema), getBidStats);

/**
 * @route GET /api/stats/socket
 * @group Statistics - WebSocket statistics
 * @description Get WebSocket connection statistics. Requires admin authentication.
 * @header {string} Authorization - Bearer token for authentication
 * @returns {object} 200 - WebSocket statistics
 * @property {number} totalConnections - Total number of active WebSocket connections
 * @property {number} auctionsTracked - Number of auctions being tracked in real-time
 * @property {number} activeRooms - Number of active WebSocket rooms
 * @property {object} connectionStats - Connection statistics
 * @property {number} peakConnections - Maximum number of concurrent connections
 * @returns {Error} 401 - Unauthorized
 * @returns {Error} 403 - Forbidden (admin access required)
 * @returns {Error} 500 - Internal server error
 */
router.get('/socket', protect, admin, getSocketStatsController);

/**
 * @route GET /api/stats/socket-rooms
 * @group Statistics - WebSocket rooms
 * @description Get information about active WebSocket rooms. Requires admin authentication.
 * @header {string} Authorization - Bearer token for authentication
 * @returns {object} 200 - WebSocket rooms information
 * @property {string[]} rooms - List of active room names
 * @property {object} roomStats - Statistics about each room
 * @property {number} totalRooms - Total number of active rooms
 * @property {number} totalClients - Total number of clients across all rooms
 * @returns {Error} 401 - Unauthorized
 * @returns {Error} 403 - Forbidden (admin access required)
 * @returns {Error} 500 - Internal server error
 */
router.get('/socket-rooms', protect, admin, getSocketRoomsController);

export default router;
