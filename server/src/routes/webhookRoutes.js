import express from 'express';
import { verifyWebhook, rawBodyParser } from '../middleware/webhookMiddleware.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Parse raw body for webhook requests
router.use(rawBodyParser);

/**
 * @swagger
 * /api/v1/webhook:
 *   post:
 *     tags: [Webhooks]
 *     summary: Process incoming webhook events
 *     description: |
 *       This endpoint processes various webhook events from external payment and subscription services.
 *       It verifies the webhook signature and routes the event to the appropriate handler.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [event, payload]
 *             properties:
 *               event:
 *                 type: string
 *                 enum: [payment.succeeded, payment.failed, subscription.updated, test.event]
 *                 description: Type of webhook event
 *                 example: "payment.succeeded"
 *               payload:
 *                 type: object
 *                 description: Event payload specific to the event type
 *                 example: {"id": "evt_123456789", "object": "event", "data": {"object": {"id": "pm_123456789"}}}
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [success, error]
 *                   example: "success"
 *                 message:
 *                   type: string
 *                   example: "Webhook processed successfully"
 *       400:
 *         description: Invalid webhook signature or missing required fields
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "error"
 *                 message:
 *                   type: string
 *                   example: "Invalid webhook signature"
 *       401:
 *         description: Unauthorized - Invalid or missing webhook secret
 *       500:
 *         description: Internal server error while processing webhook
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "error"
 *                 message:
 *                   type: string
 *                   example: "Failed to process webhook"
 */

// Webhook endpoint for processing events
router.post(
  '/',
  verifyWebhook({
    secret: process.env.WEBHOOK_SECRET,
    events: ['payment.succeeded', 'payment.failed', 'subscription.updated', 'test.event'], // 'test.event' for testing purposes
    maxAge: 300, // 5 minutes
  }),
  async (req, res) => {
    try {
      const { event, payload } = req.webhook;

      logger.info(`Processing webhook event: ${event}`, {
        delivery: req.webhook.delivery,
        eventType: event,
      });

      // Process different webhook events
      switch (event) {
        case 'payment.succeeded':
          await handlePaymentSucceeded(payload);
          break;

        case 'payment.failed':
          await handlePaymentFailed(payload);
          break;

        case 'subscription.updated':
          await handleSubscriptionUpdated(payload);
          break;

        case 'test.event': // for 'test.event' testing purposes,
          logger.info('Test webhook received', { payload });
          return res.status(200).json({
            status: 'success',
            message: 'Test webhook received successfully',
            receivedAt: new Date().toISOString(),
            payload,
          });

        default:
          logger.warn(`Unhandled webhook event: ${event}`, { payload });
      }

      res.status(200).json({ status: 'success' });
    } catch (error) {
      logger.error('Error processing webhook', {
        error: error.message,
        stack: error.stack,
        event: req.webhook?.event,
      });
      res.status(500).json({ status: 'error', message: 'Failed to process webhook' });
    }
  }
);

/**
 * Handle successful payment webhook event
 * @param {Object} payload - Payment success payload
 * @param {string} payload.id - Payment intent ID
 * @param {string} payload.amount - Amount in smallest currency unit
 * @param {string} payload.currency - Currency code (e.g., 'usd')
 * @param {Object} payload.metadata - Additional payment metadata
 * @returns {Promise<void>}
 */
async function handlePaymentSucceeded(payload) {
  try {
    logger.info('Payment succeeded', { 
      paymentId: payload.id,
      amount: payload.amount,
      currency: payload.currency 
    });
    // Implementation: Update order status in database, send confirmation email, etc.
  } catch (error) {
    logger.error('Error handling payment succeeded webhook', {
      error: error.message,
      paymentId: payload?.id,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Handle failed payment webhook event
 * @param {Object} payload - Payment failure payload
 * @param {string} payload.id - Payment intent ID
 * @param {string} payload.failure_code - Error code for the failure
 * @param {string} payload.failure_message - Human-readable failure message
 * @param {string} payload.payment_method - Payment method ID that failed
 * @returns {Promise<void>}
 */
async function handlePaymentFailed(payload) {
  try {
    logger.warn('Payment failed', {
      paymentId: payload.id,
      code: payload.failure_code,
      reason: payload.failure_message,
      method: payload.payment_method
    });
    // Implementation: Update order status, notify user of payment failure, etc.
  } catch (error) {
    logger.error('Error handling payment failed webhook', {
      error: error.message,
      paymentId: payload?.id,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Handle subscription update webhook event
 * @param {Object} payload - Subscription update payload
 * @param {string} payload.id - Subscription ID
 * @param {string} payload.status - New subscription status
 * @param {string} payload.customer - Customer ID
 * @param {string} payload.plan.id - Plan ID
 * @param {number} payload.current_period_end - Timestamp of current period end
 * @returns {Promise<void>}
 */
async function handleSubscriptionUpdated(payload) {
  try {
    logger.info('Subscription updated', {
      subscriptionId: payload.id,
      status: payload.status,
      customerId: payload.customer,
      planId: payload.plan?.id,
      currentPeriodEnd: payload.current_period_end
        ? new Date(payload.current_period_end * 1000).toISOString()
        : null
    });
    // Implementation: Update subscription in database, notify user, etc.
  } catch (error) {
    logger.error('Error handling subscription updated webhook', {
      error: error.message,
      subscriptionId: payload?.id,
      stack: error.stack
    });
    throw error;
  }
}

export default router;
