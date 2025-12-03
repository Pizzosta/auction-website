import express from 'express';
import {
  queueEmail,
  getMetrics,
  listDeadLetter,
  retryJob,
  deleteJob,
  pauseQueue,
  resumeQueue,
  testDLQ,
} from '../controllers/emailController.js';
import { protect, admin } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/jobs', protect, admin, queueEmail);
router.get('/metrics', protect, admin, getMetrics);
router.get('/dead-letter', protect, admin, listDeadLetter);
router.post('/dead-letter/:jobId/retry', protect, admin, retryJob);
router.delete('/dead-letter/:jobId', protect, admin, deleteJob);
router.post('/pause', protect, admin, pauseQueue);
router.post('/resume', protect, admin, resumeQueue);

router.post('/', protect, testDLQ)

export default router;