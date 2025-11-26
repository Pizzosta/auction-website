import logger from '../utils/logger.js';
import { env } from '../config/env.js';

/**
 * Logs API requests and responses
 */
export const apiLogger = (req, res, next) => {
  const start = Date.now();
  const { method, originalUrl, ip, headers } = req;

  // Skip logging for health checks and static files
  if (originalUrl === '/health' || originalUrl.match(/\.(js|css|jpg|png|ico|svg)$/)) {
    return next();
  }

  // Log request
  logger.info('API Request', {
    method,
    url: originalUrl,
    ip,
    userAgent: headers['user-agent'],
    timestamp: new Date().toISOString(),
    userId: req.user?.id || 'anonymous',
  });

  // Store the original send function
  const originalSend = res.send;

  // Override the response's send function
  res.send = function (body) {
    // Log the response
    const responseTime = Date.now() - start;

    logger.info('API Response', {
      method,
      url: originalUrl,
      statusCode: res.statusCode,
      responseTime: `${responseTime}ms`,
      timestamp: new Date().toISOString(),
      userId: req.user?.id || 'anonymous',
    });

    // Call the original send function
    return originalSend.call(this, body);
  };

  next();
};

/**
 * Logs errors in the API
 */
export const errorLogger = (err, req, res, next) => {
  logger.error('API Error', {
    message: err.message,
    stack: env.isDev ? err.stack : undefined,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userId: req.user?.id || 'anonymous',
    timestamp: new Date().toISOString(),
  });

  next(err);
};

export default { apiLogger, errorLogger };
