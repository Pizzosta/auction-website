import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validationMiddleware.js';
import { idSchema, feedbackSchema, feedbackQuerySchema } from '../utils/validators.js';
import {
  createFeedback,
  getUserFeedback,
  respondToFeedback,
  getFeedbackSummary,
  getFeedbackSentByUser,
} from '../controllers/feedbackController.js';

const router = express.Router();

/**
 * @route POST /api/feedback
 * @group Feedback - feedback management
 * @description Create a new feedback for an auction. Requires authentication.
 * @header {string} Authorization - Bearer token for authentication
 * @param {object} body.body.required - Feedback details
 * @param {string} body.auctionId - ID of the auction
 * @param {string} body.type - Type of feedback (buyer/seller)
 * @param {number} body.rating - Rating (1-5)
 * @param {string} body.comment - Feedback comment
 * @returns {object} 201 - Feedback created successfully
 * @returns {Error} 400 - Invalid input
 * @returns {Error} 401 - Unauthorized
 * @returns {Error} 403 - Not allowed to leave feedback
 * @returns {Error} 404 - Auction not found
 * @returns {Error} 409 - Feedback already exists
 */
router.post('/', protect, validate(feedbackSchema.create, 'body'), createFeedback);

/**
 * @route GET /api/feedback/user/{userId}
 * @group Feedback - feedback management
 * @description Get feedback received by a specific user.
 * @header {string} Authorization - Bearer token for authentication
 * @param {string} userId.path.required - ID of the user to get feedback for
 * @param {string} type.query - Filter by feedback type (buyer/seller)
 * @param {number} minRating.query - Filter by minimum rating (1-5)
 * @param {string} sort.query - Sort field (createdAt, rating)
 * @param {string} order.query - Sort order (asc, desc)
 * @param {number} page.query - Page number for pagination
 * @param {number} limit.query - Number of items per page
 * @returns {object} 200 - List of feedback
 * @returns {Error} 400 - Invalid user ID
 * @returns {Error} 401 - Unauthorized
 * @returns {Error} 403 - Forbidden
 * @returns {Error} 404 - User not found
 */
router.get(
  '/user/:userId',
  protect,
  validate(idSchema('userId'), 'params'),
  validate(feedbackQuerySchema, 'query'),
  getUserFeedback
);

/**
 * @route GET /api/feedback/summary/{userId}
 * @group Feedback - feedback management
 * @description Get feedback summary for a user (average rating, total count, etc.)
 * @header {string} Authorization - Bearer token for authentication
 * @param {string} userId.path.required - ID of the user to get summary for
 * @returns {object} 200 - Feedback summary
 * @property {number} averageRating - Average rating (1-5)
 * @property {number} totalCount - Total number of feedbacks
 * @property {object} ratingBreakdown - Count of each rating (1-5)
 * @property {number} positivePercentage - Percentage of positive ratings (4-5)
 * @returns {Error} 400 - Invalid user ID
 * @returns {Error} 401 - Unauthorized
 * @returns {Error} 404 - User not found
 */
router.get('/summary/:userId', protect, validate(idSchema('userId'), 'params'), getFeedbackSummary);

/**
 * @route POST /api/feedback/{feedbackId}/respond
 * @group Feedback - feedback management
 * @description Add a response to feedback. Only the recipient can respond.
 * @header {string} Authorization - Bearer token for authentication
 * @param {string} feedbackId.path.required - ID of the feedback to respond to
 * @param {object} body.body.required - Response details
 * @param {string} body.response - The response text
 * @returns {object} 200 - Response added successfully
 * @returns {Error} 400 - Invalid input
 * @returns {Error} 401 - Unauthorized
 * @returns {Error} 403 - Not allowed to respond to this feedback
 * @returns {Error} 404 - Feedback not found
 * @returns {Error} 409 - Response already exists
 */
router.post(
  '/:feedbackId/respond',
  protect,
  validate(idSchema('feedbackId'), 'params'),
  validate(feedbackSchema.respond, 'body'),
  respondToFeedback
);

/**
 * @route GET /api/feedback/sent/{userId}
 * @group Feedback - feedback management
 * @description Get feedback sent by a specific user.
 * @header {string} Authorization - Bearer token for authentication
 * @param {string} userId.path.required - ID of the user who sent the feedback
 * @param {string} type.query - Filter by feedback type (buyer/seller)
 * @param {string} sort.query - Sort field (createdAt, rating)
 * @param {string} order.query - Sort order (asc, desc)
 * @param {number} page.query - Page number for pagination
 * @param {number} limit.query - Number of items per page
 * @returns {object} 200 - List of feedback sent by the user
 * @returns {Error} 400 - Invalid user ID
 * @returns {Error} 401 - Unauthorized
 * @returns {Error} 403 - Forbidden
 * @returns {Error} 404 - User not found
 */
router.get(
  '/sent/:userId',
  protect,
  validate(idSchema('userId'), 'params'),
  validate(feedbackQuerySchema, 'query'),
  getFeedbackSentByUser
);

export default router;
