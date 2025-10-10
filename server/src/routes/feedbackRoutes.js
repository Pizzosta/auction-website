import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validationMiddleware.js';
import { idSchema, feedbackSchema, feedbackQuerySchema } from '../utils/validators.js';
import {
  createFeedback,
  getUserFeedback,
  respondToFeedback,
  getFeedbackSummary
} from '../controllers/feedbackController.js';

const router = express.Router();

// Create feedback
router.post('/', protect, validate(feedbackSchema.create, 'body'), createFeedback);

// Get user feedback
router.get('/user/:userId', protect, validate(idSchema('userId'), 'params'), validate(feedbackQuerySchema, 'query'), getUserFeedback);

// Get feedback summary
router.get('/summary/:userId', protect, validate(idSchema('userId'), 'params'), getFeedbackSummary);

// Respond to feedback
router.post('/:feedbackId/respond', protect, validate(idSchema('feedbackId'), 'params'), validate(feedbackSchema.respond, 'body'), respondToFeedback);

export default router;