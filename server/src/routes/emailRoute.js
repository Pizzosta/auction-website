import express from 'express';
import {
  queueEmail,
  getMetrics,
  listDeadLetter,
  retryJob,
  deleteJob,
  pauseQueue,
  resumeQueue,
} from '../controllers/emailController.js';
import { protect, admin } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Email
 *   description: Email queue management and monitoring
 */

/**
 * @swagger
 * /api/v1/email/jobs:
 *   post:
 *     tags: [Email]
 *     summary: Queue a new email job
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               type:
 *                 type: string
 *                 example: passwordReset
 *               to:
 *                 type: string
 *                 example: user@example.com
 *               context:
 *                 type: object
 *                 example: { username: "JohnDoe", resetLink: "https://example.com/reset" }
 *     responses:
 *       201:
 *         description: Email job queued
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.post('/jobs', protect, admin, queueEmail);

/**
 * @swagger
 * /api/v1/email/metrics:
 *   get:
 *     tags: [Email]
 *     summary: Get email queue metrics
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Email queue metrics
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.get('/metrics', protect, admin, getMetrics);

/**
 * @swagger
 * /api/v1/email/dead-letter:
 *   get:
 *     tags: [Email]
 *     summary: List dead letter (failed) email jobs
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: skip
 *         schema:
 *           type: integer
 *         description: Number of jobs to skip (for pagination)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Number of jobs to return
 *     responses:
 *       200:
 *         description: List of dead letter jobs
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.get('/dead-letter', protect, admin, listDeadLetter);

/**
 * @swagger
 * /api/v1/email/dead-letter/{jobId}/retry:
 *   post:
 *     tags: [Email]
 *     summary: Retry a dead letter (failed) email job
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *         description: Dead letter job ID
 *     responses:
 *       200:
 *         description: Job retried
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Job not found
 */
router.post('/dead-letter/:jobId/retry', protect, admin, retryJob);

/**
 * @swagger
 * /api/v1/email/dead-letter/{jobId}:
 *   delete:
 *     tags: [Email]
 *     summary: Delete a dead letter (failed) email job
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *         description: Dead letter job ID
 *     responses:
 *       200:
 *         description: Job deleted
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Job not found
 */
router.delete('/dead-letter/:jobId', protect, admin, deleteJob);

/**
 * @swagger
 * /api/v1/email/pause:
 *   post:
 *     tags: [Email]
 *     summary: Pause the email queue
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Queue paused
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.post('/pause', protect, admin, pauseQueue);

/**
 * @swagger
 * /api/v1/email/resume:
 *   post:
 *     tags: [Email]
 *     summary: Resume the email queue
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Queue resumed
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.post('/resume', protect, admin, resumeQueue);

export default router;