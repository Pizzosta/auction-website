import { env, validateEnv } from '../config/env.js';
import logger from '../utils/logger.js';

// Validate required environment variables
const missingVars = validateEnv();

if (missingVars.length > 0) {
  logger.error(`Missing required environment variables: ${missingVars.join(', ')}`);
  process.exit(1);
}

export const validate = (schema, property = 'body') => {
  return (req, res, next) => {
    const defaultServerTime = new Date();
    const toleranceTime = new Date(
      defaultServerTime.getTime() - parseInt(env.serverTimeToleranceMinutes, 10)
    );

    // Every request gets a new server time automatically
    const context = { serverTime: toleranceTime };

    // For file uploads, check if files exist instead of the property
    if (property === 'file') {
      if (!req.file && !req.files) {
        return res.status(400).json({
          status: 'fail',
          message: 'Validation error',
          details: ['No file was uploaded'],
        });
      }

      return next();
    }

    // Handle cases where the property might not exist on the request
    if (!req[property]) {
      req[property] = {};
    }

    const { error, value } = schema.validate(req[property], {
      abortEarly: false,      // Return all errors
      stripUnknown: true,     // Remove unknown fields automatically
      escapeHtml: true,       // Helps prevent XSS
      convert: true,          // Attempt to convert values to required types
      context,
    });

    if (error) {
      // Map error details to an object: { field: message }
      const errorObject = {};

      for (const err of error.details) {
        const key = err.path[0] || 'unknown';

        if (!errorObject[key]) {
          errorObject[key] = err.message.replace(/["']/g, '');
        }
      }

      logger.warn('Validation failed', {
        route: req.originalUrl,
        errors: errorObject,
        receivedData: req[property],
        serverTime: context.serverTime.toISOString(),
      });

      return res.status(400).json({
        status: 'fail',
        message: 'Validation error',
        details: errorObject,
      });
    }

    // Handle different property types appropriately
    switch (property) {
      case 'query':
        // For query parameters, merge to preserve other query params
        Object.assign(req.query, value);
        break;

      case 'params':
        // For route parameters, replace entirely as they're typically fixed
        req.params = value;
        break;

      case 'body':
        // For body, replace entirely to ensure no unexpected fields remain
        req.body = value;
        break;

      case 'headers':
        // For headers, merge to preserve other headers
        Object.assign(req.headers, value);
        break;

      default:
        // For custom properties, assign directly
        req[property] = value;
    }

    next();
  };
};