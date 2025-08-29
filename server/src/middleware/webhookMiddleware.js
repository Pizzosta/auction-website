import crypto from 'crypto';
import { webhookSchema } from '../utils/validators.js';
import logger from '../utils/logger.js';

/**
 * Middleware to verify webhook signature and validate headers
 * @param {Object} options - Configuration options
 * @param {string} options.secret - Webhook secret for signature verification
 * @param {string[]} [options.events] - List of allowed webhook events
 * @param {number} [options.maxAge=300] - Maximum age of the webhook request in seconds
 * @returns {Function} Express middleware function
 */
export const verifyWebhook = (options = {}) => {
  // Destructure without immediate validation
  const { events = [], maxAge = 300 } = options;

  return [
    validateWebhookHeaders(events),
    async (req, res, next) => {
      // Check secret here, at request time
      const secret = process.env.WEBHOOK_SECRET;
      if (!secret) {
        logger.error('Webhook secret is not configured');
        return res.status(500).json({
          status: 'error',
          message: 'Server configuration error'
        });
      }

      try {
        const signature = req.headers['x-webhook-signature'];
        const timestamp = parseInt(req.headers['x-request-timestamp'], 10);

        // Rest of your verification logic...
        webhookSchema.validateTimestamp(timestamp, maxAge);

        const expectedSignature = crypto
          .createHmac('sha256', secret)
          .update(`${timestamp}.${JSON.stringify(req.body)}`)
          .digest('hex');

        const isValid = crypto.timingSafeEqual(
          Buffer.from(signature),
          Buffer.from(expectedSignature)
        );

        if (!isValid) {
          logger.warn('Invalid webhook signature', {
            received: signature,
            expected: expectedSignature
          });
          return res.status(401).json({
            status: 'error',
            message: 'Invalid webhook signature'
          });
        }

        // Add webhook context to request
        req.webhook = {
          event: req.headers['x-webhook-event'],
          delivery: req.headers['x-webhook-delivery'],
          timestamp,
          payload: req.body
        };

        next();
      } catch (error) {
        logger.error('Webhook verification failed', { error: error.message });
        return res.status(400).json({
          status: 'error',
          message: error.message || 'Webhook verification failed'
        });
      }
    }
  ];
};

/**
 * Middleware to validate webhook headers
 * @param {string[]} allowedEvents - List of allowed webhook events
 */
const validateWebhookHeaders = (allowedEvents = []) => {
  return (req, res, next) => {
    // Convert headers to lowercase for case-insensitive matching
    const headers = {};
    Object.entries(req.headers).forEach(([key, value]) => {
      headers[key.toLowerCase()] = value;
    });
    
    // Validate headers against schema
    const { error } = webhookSchema.headers.validate(headers, { allowUnknown: true });
    
    if (error) {
      logger.warn('Invalid webhook headers', { error: error.message });
      return res.status(400).json({ 
        status: 'error',
        message: `Invalid webhook headers: ${error.message}`
      });
    }

    // Check if event is allowed
    if (allowedEvents.length > 0 && !allowedEvents.includes(headers['x-webhook-event'])) {
      logger.warn('Webhook event not allowed', { 
        event: headers['x-webhook-event'],
        allowedEvents 
      });
      return res.status(400).json({ 
        status: 'error',
        message: `Webhook event '${headers['x-webhook-event']}' is not allowed`
      });
    }

    next();
  };
};

/**
 * Middleware to parse raw request body for webhooks
 */
export const rawBodyParser = (req, res, next) => {
  if (req.path === '/webhook' && req.method === 'POST') {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => {
      try {
        req.rawBody = data;
        if (req.headers['content-type'] === 'application/json') {
          req.body = JSON.parse(data);
        }
        next();
      } catch (error) {
        logger.error('Error parsing webhook body', { error: error.message });
        return res.status(400).json({ 
          status: 'error',
          message: 'Invalid JSON payload' 
        });
      }
    });
  } else {
    next();
  }
};
