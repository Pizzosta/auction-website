import logger from '../utils/logger.js';

/**
 * Logs all incoming requests
 */
const requestLogger = (req, res, next) => {
  // Skip logging for health checks
  if (req.path === '/health') {
    return next();
  }

  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;

    logger.http(`${req.method} ${req.originalUrl}`, {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      ...(req.user && { userId: req.user.id }),
    });
  });

  next();
};

export default requestLogger;
