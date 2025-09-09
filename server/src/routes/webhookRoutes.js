import express from 'express';
import { verifyWebhook, rawBodyParser } from '../middleware/webhookMiddleware.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Parse raw body for webhook requests
router.use(rawBodyParser);

/**
 * @route POST /api/v1/webhook
 * @group Webhook - webhook events
 * @description Process incoming webhook events from external services.
 * @returns {object} 200 - Webhook processed
 * @returns {Error}  default - Unexpected error
 */

// Webhook endpoint for processing events
router.post(
    '/',
    verifyWebhook({
        secret: process.env.WEBHOOK_SECRET,
        events: ['payment.succeeded', 'payment.failed', 'subscription.updated', 'test.event'], // 'test.event' for testing purposes
        maxAge: 300 // 5 minutes
    }),
    async (req, res) => {
        try {
            const { event, payload } = req.webhook;

            logger.info(`Processing webhook event: ${event}`, {
                delivery: req.webhook.delivery,
                eventType: event
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
                        payload
                    });

                default:
                    logger.warn(`Unhandled webhook event: ${event}`, { payload });
            }

            res.status(200).json({ status: 'success' });
        } catch (error) {
            logger.error('Error processing webhook', {
                error: error.message,
                stack: error.stack,
                event: req.webhook?.event
            });
            res.status(500).json({ status: 'error', message: 'Failed to process webhook' });
        }
    }
);

// Webhook event handlers
async function handlePaymentSucceeded(payload) {
    // Implement payment success logic
    logger.info('Payment succeeded', { paymentId: payload.id });
    // Example: Update order status in database
}

async function handlePaymentFailed(payload) {
    // Implement payment failure logic
    logger.warn('Payment failed', {
        paymentId: payload.id,
        reason: payload.failure_message
    });
    // Example: Notify user of payment failure
}

async function handleSubscriptionUpdated(payload) {
    // Implement subscription update logic
    logger.info('Subscription updated', {
        subscriptionId: payload.id,
        status: payload.status
    });
    // Example: Update subscription status in database
}

export default router;
