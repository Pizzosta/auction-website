import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validationMiddleware.js';
import { idSchema, feedbackSchema, feedbackQuerySchema } from '../utils/validators.js';
import {
  createFeedback,
  getReceivedFeedback,
  respondToFeedback,
  getFeedbackSummary,
  getSentFeedback,
} from '../controllers/feedbackController.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Feedback
 *   description: Feedback management
 */

/**
 * @swagger
 * /api/v1/feedback:
 *   post:
 *     tags: [Feedback]
 *     summary: Create feedback for an auction
 *     description: Leave feedback (rating and comment) for a completed auction. Buyers can rate sellers and vice versa.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - auctionId
 *               - type
 *               - rating
 *             properties:
 *               auctionId:
 *                 type: string
 *                 format: uuid
 *                 example: 5f8d0f4d7f4f3b2a1c9e8d7a
 *               type:
 *                 type: string
 *                 enum: [buyer, seller]
 *                 example: seller
 *               rating:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *                 example: 5
 *               comment:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 500
 *                 example: Great seller, item as described!
 *               isAnonymous:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       201:
 *         description: Feedback created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 rating:
 *                   type: integer
 *                 comment:
 *                   type: string
 *                 type:
 *                   type: string
 *                   enum: [seller, buyer]
 *                 auctionId:
 *                   type: string
 *                 fromUserId:
 *                   type: string
 *                 toUserId:
 *                   type: string
 *                 isAnonymous:
 *                   type: boolean
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Invalid input or auction not completed
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: User not authorized to leave feedback for this auction
 *       404:
 *         description: Auction not found
 *       409:
 *         description: Feedback already submitted
 *       500:
 *         description: Internal server error
 */
router.post('/', protect, validate(feedbackSchema.create, 'body'), createFeedback);

/**
 * @swagger
 * /api/v1/feedback/received:
 *   get:
 *     tags: [Feedback]
 *     summary: Get feedback received by user
 *     description: Retrieve all feedback/reviews received by a specific user as a seller with filtering and pagination.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [buyer, seller]
 *         description: Filter by feedback type
 *       - in: query
 *         name: minRating
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 5
 *         description: Filter by minimum rating
 *       - in: query
 *         name: maxRating
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 5
 *         description: Maximum rating filter
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [createdAt, updatedAt, rating]
 *           default: createdAt
 *         description: Field to sort by
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort order
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *         description: Number of items per page
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter feedback from this date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter feedback until this date
 *       - in: query
 *         name: fields
 *         schema:
 *           type: string
 *           example: "rating,comment,fromUser.username,auction.title"
 *         description: Comma-separated list of fields to include in the response. Supports nested fields using dot notation.
 *     responses:
 *       200:
 *         description: Feedback retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     pages:
 *                       type: integer
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       rating:
 *                         type: integer
 *                       comment:
 *                         type: string
 *                       type:
 *                         type: string
 *                         enum: [seller, buyer]
 *                       auction:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           title:
 *                             type: string
 *                       fromUser:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           username:
 *                             type: string
 *                       response:
 *                         type: string
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 *       500:
 *         description: Internal server error
 */
router.get(
  '/received',
  protect,
  validate(feedbackQuerySchema, 'query'),
  getReceivedFeedback
);

/**
 * @swagger
 * /api/v1/feedback/summary:
 *   get:
 *     tags: [Feedback]
 *     summary: Get feedback summary for user
 *     description: Get aggregated feedback statistics including average rating and rating distribution
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Feedback summary retrieved successfully
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
 *                     averageRating:
 *                       type: number
 *                       format: float
 *                       example: 4.5
 *                     totalCount:
 *                       type: integer
 *                       example: 42
 *                     ratingBreakdown:
 *                       type: object
 *                       properties:
 *                         1:
 *                           type: integer
 *                           example: 2
 *                         2:
 *                           type: integer
 *                           example: 3
 *                         3:
 *                           type: integer
 *                           example: 5
 *                         4:
 *                           type: integer
 *                           example: 12
 *                         5:
 *                           type: integer
 *                           example: 20
 *                     positivePercentage:
 *                       type: number
 *                       format: float
 *                       example: 76.19
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 *       500:
 *         description: Internal server error
 */
router.get('/summary', protect, getFeedbackSummary);

/**
 * @swagger
 * /api/v1/feedback/{feedbackId}/respond:
 *   post:
 *     tags: [Feedback]
 *     summary: Respond to feedback
 *     description: Add a response to feedback. Only the recipient of the feedback can respond.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: feedbackId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID of the feedback to respond to
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - response
 *             properties:
 *               response:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 1000
 *                 example: Thank you for your feedback!
 *     responses:
 *       200:
 *         description: Response added successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 rating:
 *                   type: integer
 *                 comment:
 *                   type: string
 *                 response:
 *                   type: string
 *                 type:
 *                   type: string
 *                   enum: [seller, buyer]
 *                 auctionId:
 *                   type: string
 *                 fromUserId:
 *                   type: string
 *                 toUserId:
 *                   type: string
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Invalid response text
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not authorized to respond to this feedback
 *       404:
 *         description: Feedback not found
 *       500:
 *         description: Internal server error
 */
router.post(
  '/:feedbackId/respond',
  protect,
  validate(idSchema('feedbackId'), 'params'),
  validate(feedbackSchema.respond, 'body'),
  respondToFeedback
);

/**
 * @swagger
 * /api/v1/feedback/sent:
 *   get:
 *     tags: [Feedback]
 *     summary: Get feedback sent by user
 *     description: Retrieve all feedback/reviews sent by a specific user as a buyer with filtering and pagination.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [buyer, seller]
 *         description: Filter by feedback type
 *       - in: query
 *         name: minRating
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 5
 *         description: Filter by minimum rating
 *       - in: query
 *         name: maxRating
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 5
 *         description: Filter by maximum rating
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [createdAt, updatedAt, rating]
 *           default: createdAt
 *         description: Field to sort by
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort order
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *         description: Number of items per page
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter feedback from this date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter feedback until this date
 *       - in: query
 *         name: fields
 *         schema:
 *           type: string
 *           example: "rating,comment,fromUser.username,auction.title"
 *         description: Comma-separated list of fields to include in the response. Supports nested fields using dot notation.
 *     responses:
 *       200:
 *         description: Feedback sent by user retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     pages:
 *                       type: integer
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       rating:
 *                         type: integer
 *                       comment:
 *                         type: string
 *                       type:
 *                         type: string
 *                         enum: [seller, buyer]
 *                       auction:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           title:
 *                             type: string
 *                       toUser:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           username:
 *                             type: string
 *                       response:
 *                         type: string
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 *       500:
 *         description: Internal server error
 */
router.get(
  '/sent',
  protect,
  validate(feedbackQuerySchema, 'query'),
  getSentFeedback
);

export default router;
