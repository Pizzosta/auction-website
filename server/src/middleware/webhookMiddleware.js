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

        // Use the raw body for signature verification when available
        const payloadForSig = req.rawBody ?? JSON.stringify(req.body);

        const expectedSignature = crypto
          .createHmac('sha256', secret)
          .update(`${timestamp}.${payloadForSig}`)
          .digest('hex');

        // Make timing-safe comparison robust by ensuring equal buffer lengths
        const receivedBuf = Buffer.from(signature || '', 'utf8');
        const expectedBuf = Buffer.from(expectedSignature, 'utf8');
        const isValid = receivedBuf.length === expectedBuf.length &&
          crypto.timingSafeEqual(receivedBuf, expectedBuf);

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
  if (req.method !== 'POST') return next();

  // Only care about JSON payloads for this webhook
  const contentType = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (contentType !== 'application/json') return next();

  // If another middleware (e.g., express.json) already consumed the stream,
  // avoid waiting on 'end' and synthesize rawBody from the parsed body.
  if (req.readableEnded || typeof req.body === 'object') {
    try {
      if (!req.rawBody) {
        req.rawBody = JSON.stringify(req.body ?? {});
      }
      return next();
    } catch (error) {
      logger.error('Error synthesizing raw body from parsed JSON', { error: error.message });
      return res.status(400).json({
        status: 'error',
        message: 'Invalid JSON payload'
      });
    }
  }

  // Otherwise, collect the raw body safely
  let data = '';
  let aborted = false;
  const MAX_BYTES = 1_000_000; // 1MB safety limit
  const TIMEOUT_MS = 5000; // 5s timeout to prevent hanging

  req.setEncoding('utf8');

  const onAbort = () => {
    aborted = true;
    cleanup();
    logger.warn('Webhook body parsing aborted');
    return res.status(408).json({ status: 'error', message: 'Request timeout while parsing body' });
  };

  const timeout = setTimeout(onAbort, TIMEOUT_MS);

  const cleanup = () => {
    clearTimeout(timeout);
    req.removeListener('data', onData);
    req.removeListener('end', onEnd);
    req.removeListener('error', onError);
    req.removeListener('aborted', onAbort);
  };

  const onError = (err) => {
    if (aborted) return; // already handled
    cleanup();
    logger.error('Error reading webhook body', { error: err?.message });
    return res.status(400).json({ status: 'error', message: 'Invalid request body' });
  };

  const onData = (chunk) => {
    data += chunk;
    if (data.length > MAX_BYTES) {
      aborted = true;
      cleanup();
      logger.warn('Webhook payload too large');
      return res.status(413).json({ status: 'error', message: 'Payload too large' });
    }
  };

  const onEnd = () => {
    if (aborted) return;
    cleanup();
    try {
      req.rawBody = data;
      req.body = JSON.parse(data);
      return next();
    } catch (error) {
      logger.error('Error parsing webhook body', { error: error.message });
      return res.status(400).json({ status: 'error', message: 'Invalid JSON payload' });
    }
  };

  req.on('aborted', onAbort);
  req.on('error', onError);
  req.on('data', onData);
  req.on('end', onEnd);
};
