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
 * @swagger
 * tags:
 *   name: Statistics
 *   description: Statistics management
 */

/**
 * @swagger
 * /api/v1/stats/system:
 *   get:
 *     tags: [Statistics]
 *     summary: Get system-wide statistics
 *     security:
 *       - bearerAuth: []
 *     description: Retrieve comprehensive system statistics including users, auctions, and bids within a specified time frame
 *     parameters:
 *       - in: query
 *         name: timeFrame
 *         schema:
 *           type: string
 *           enum: [day, week, month, year, all]
 *           default: month
 *         description: Time period for statistics
 *     responses:
 *       200:
 *         description: System statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     users:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                         active:
 *                           type: integer
 *                         inactive:
 *                           type: integer
 *                         new:
 *                           type: integer
 *                     auctions:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                         active:
 *                           type: integer
 *                         ended:
 *                           type: integer
 *                     bids:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                         today:
 *                           type: integer
 *                         averagePerAuction:
 *                           type: string
 *                     timeFrame:
 *                       type: object
 *                       properties:
 *                         value:
 *                           type: string
 *                         startDate:
 *                           type: string
 *                           format: date-time
 *                         endDate:
 *                           type: string
 *                           format: date-time
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (admin access required)
 *       500:
 *         description: Internal server error
 */
router.get('/', protect, admin, validate(statsQuerySchema), getSystemStats);

/**
 * @swagger
 * /api/v1/stats/auctions:
 *   get:
 *     tags: [Statistics]
 *     summary: Get auction statistics
 *     security:
 *       - bearerAuth: []
 *     description: Retrieve detailed auction statistics including status distribution and category breakdown
 *     parameters:
 *       - in: query
 *         name: timeFrame
 *         schema:
 *           type: string
 *           enum: [day, week, month, year, all]
 *           default: month
 *         description: Time period for statistics
 *     responses:
 *       200:
 *         description: Auction statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalAuctions:
 *                       type: integer
 *                     auctionsByStatus:
 *                       type: object
 *                       properties:
 *                         active:
 *                           type: integer
 *                         completed:
 *                           type: integer
 *                         upcoming:
 *                           type: integer
 *                     auctionsByCategory:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           category:
 *                             type: string
 *                           count:
 *                             type: integer
 *                     averageBidsPerAuction:
 *                       type: string
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (admin access required)
 *       500:
 *         description: Internal server error
 */
router.get('/auctions', protect, admin, validate(statsQuerySchema), getAuctionStats);

/**
 * @swagger
 * /api/v1/stats/users:
 *   get:
 *     tags: [Statistics]
 *     summary: Get user statistics
 *     description: |
 *       Retrieve detailed statistics about users including registration metrics and activity.
 *       Requires admin authentication.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: timeFrame
 *         schema:
 *           type: string
 *           enum: [day, week, month, year, all]
 *           default: month
 *         description: Time frame for the statistics
 *     responses:
 *       200:
 *         description: User statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserStats'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 *
 * components:
 *   schemas:
 *     UserStats:
 *       type: object
 *       properties:
 *         totalUsers:
 *           type: integer
 *           example: 1000
 *           description: Total number of users
 *         activeUsers:
 *           type: integer
 *           example: 750
 *           description: Number of active users
 *         newUsers:
 *           type: integer
 *           example: 150
 *           description: Number of new users in the specified time frame
 *         byRole:
 *           type: object
 *           properties:
 *             user:
 *               type: integer
 *               example: 950
 *             admin:
 *               type: integer
 *               example: 50
 *           description: User count by role
 *         byRegistrationSource:
 *           type: object
 *           properties:
 *             email:
 *               type: integer
 *               example: 800
 *             google:
 *               type: integer
 *               example: 150
 *             facebook:
 *               type: integer
 *               example: 50
 *           description: User count by registration source
 *         avgAuctionsPerUser:
 *           type: number
 *           format: float
 *           example: 2.5
 *           description: Average number of auctions per user
 *         avgBidsPerUser:
 *           type: number
 *           format: float
 *           example: 15.3
 *           description: Average number of bids per user
 */
router.get('/users', protect, admin, validate(statsQuerySchema), getUserStats);

/**
 * @swagger
 * /api/v1/stats/bids:
 *   get:
 *     tags: [Statistics]
 *     summary: Get bid statistics
 *     security:
 *       - bearerAuth: []
 *     description: Retrieve detailed bid statistics including amounts and top performers
 *     parameters:
 *       - in: query
 *         name: timeFrame
 *         schema:
 *           type: string
 *           enum: [day, week, month, year, all]
 *           default: month
 *         description: Time period for statistics
 *     responses:
 *       200:
 *         description: Bid statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalBids:
 *                       type: integer
 *                     bidsToday:
 *                       type: integer
 *                     averageBidAmount:
 *                       type: string
 *                     highestBid:
 *                       type: object
 *                       properties:
 *                         amount:
 *                           type: number
 *                         auction:
 *                           type: object
 *                           nullable: true
 *                         bidder:
 *                           type: object
 *                           nullable: true
 *                     bidsByAuction:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           auctionId:
 *                             type: string
 *                           title:
 *                             type: string
 *                           bidCount:
 *                             type: integer
 *                     bidsByUser:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           userId:
 *                             type: string
 *                           username:
 *                             type: string
 *                           bidCount:
 *                             type: integer
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (admin access required)
 *       500:
 *         description: Internal server error
 */
router.get('/bids', protect, admin, validate(statsQuerySchema), getBidStats);

/**
 * @swagger
 * /api/v1/stats/socket:
 *   get:
 *     tags: [Statistics]
 *     summary: Get WebSocket connection statistics
 *     description: |
 *       Retrieve real-time WebSocket connection statistics including active connections and rooms.
 *       Requires admin authentication.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: WebSocket statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   additionalProperties: true
 *                   properties:
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                     uptime:
 *                       type: number
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (admin access required)
 *       500:
 *         description: Internal server error
 *
 * components:
 *   schemas:
 *     WebSocketStats:
 *       type: object
 *       properties:
 *         totalConnections:
 *           type: integer
 *           example: 250
 *           description: Total number of active WebSocket connections
 *         auctionsTracked:
 *           type: integer
 *           example: 50
 *           description: Number of auctions being tracked in real-time
 *         activeRooms:
 *           type: integer
 *           example: 75
 *           description: Number of active WebSocket rooms
 *         connectionStats:
 *           type: object
 *           properties:
 *             connectedLastHour:
 *               type: integer
 *               example: 500
 *               description: Number of unique connections in the last hour
 *             avgConnectionDuration:
 *               type: number
 *               format: float
 *               example: 15.5
 *               description: Average connection duration in minutes
 *         peakConnections:
 *           type: integer
 *           example: 500
 *           description: Maximum number of concurrent connections
 */
router.get('/socket', protect, admin, getSocketStatsController);

/**
 * @swagger
 * /api/v1/stats/socket-rooms:
 *   get:
 *     tags: [Statistics]
 *     summary: Get WebSocket rooms information
 *     description: |
 *       Retrieve detailed information about active WebSocket rooms and their clients.
 *       Requires admin authentication.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: WebSocket room details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     detailedRoomInfo:
 *                       type: object
 *                       properties:
 *                         userRooms:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               userId:
 *                                 type: string
 *                               roomCount:
 *                                 type: integer
 *                               rooms:
 *                                 type: array
 *                                 items:
 *                                   type: string
 *                         auctionRooms:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               auctionId:
 *                                 type: string
 *                               bidders:
 *                                 type: array
 *                                 items:
 *                                   type: string
 *                               biddersCount:
 *                                 type: integer
 *                               viewers:
 *                                 type: integer
 *                               total:
 *                                 type: integer
 *                         auctionTimers:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               auctionId:
 *                                 type: string
 *                               hasTimer:
 *                                 type: boolean
 *                               hasInterval:
 *                                 type: boolean
 *                               endTime:
 *                                 type: string
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                     uptime:
 *                       type: number
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (admin access required)
 *       500:
 *         description: Internal server error
 *
 * components:
 *   schemas:
 *     WebSocketRooms:
 *       type: object
 *       properties:
 *         rooms:
 *           type: array
 *           items:
 *             type: string
 *           example: ["auction:123", "user:456", "admin:monitor"]
 *           description: List of active room names
 *         roomStats:
 *           type: object
 *           additionalProperties:
 *             type: object
 *             properties:
 *               clients:
 *                 type: integer
 *                 example: 25
 *                 description: Number of clients in the room
 *               createdAt:
 *                 type: string
 *                 format: date-time
 *                 example: "2025-01-01T12:00:00Z"
 *                 description: When the room was created
 *         totalRooms:
 *           type: integer
 *           example: 50
 *           description: Total number of active rooms
 *         totalClients:
 *           type: integer
 *           example: 250
 *           description: Total number of clients across all rooms
 *
 *     responses:
 *       UnauthorizedError:
 *         description: Unauthorized - Missing or invalid authentication token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       ForbiddenError:
 *         description: Forbidden - User doesn't have required permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       ServerError:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *
 *     Error:
 *       type: object
 *       properties:
 *         status:
 *           type: string
 *           example: "error"
 *         message:
 *           type: string
 *           example: "Error message describing the issue"
 */
router.get('/socket-rooms', protect, admin, getSocketRoomsController);

export default router;
