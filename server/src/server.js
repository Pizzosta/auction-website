import express from 'express';
import compression from 'compression';
import apiDocsRouter from './swagger.js';
import http from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import logger, { httpLogger, loggerClose } from './utils/logger.js';
import requestLogger from './middleware/requestLogger.js';
import securityMiddleware from './middleware/security.js';
import cacheHeaders from './middleware/cacheHeaders.js';
import cacheMiddleware from './middleware/cacheMiddleware.js';
import { apiLogger, errorLogger } from './middleware/apiLogger.js';
import { globalErrorHandler, AppError } from './middleware/errorHandler.js';
import './jobs/index.js'; // Import jobs to start the scheduler
import { requestContextMiddleware } from './middleware/requestContext.js';
import { env, validateEnv } from './config/env.js';
import { closeRedisClient } from './config/redisAdapter.js';
import { pubsub } from './services/queuePubSub.js';
import { getEmailQueue, closeQueues } from './services/emailQueueService.js';
import initializeCloudinary from './config/cloudinary.js';
import { getRedisClient } from './config/redisAdapter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Validate required environment variables once at startup
const missingVars = validateEnv();

if (missingVars.length > 0) {
  logger.error(`Missing required environment variables: ${missingVars.join(', ')}`);
  process.exit(1);
}

// Log initial memory usage
const logMemoryUsage = (label = 'Memory usage') => {
  const { rss, heapTotal, heapUsed, external } = process.memoryUsage();
  logger.info(`${label}:`, {
    rss: `${(rss / 1024 / 1024).toFixed(2)} MB`,
    heapTotal: `${(heapTotal / 1024 / 1024).toFixed(2)} MB`,
    heapUsed: `${(heapUsed / 1024 / 1024).toFixed(2)} MB`,
    external: `${(external / 1024 / 1024).toFixed(2)} MB`,
  });
};

// Log initial memory usage
logMemoryUsage('Initial memory usage');

// Initialize Cloudinary
try {
  await initializeCloudinary();
  logger.info('Cloudinary initialized successfully');
} catch (error) {
  logger.error('Failed to initialize Cloudinary. Image uploads will not work.');
  if (env.isProd) {
    process.exit(1); // Fail fast in production
  }
}

// Eagerly connect Redis (used by rate limiting and queues) BEFORE middleware/routes
try {
  await getRedisClient();
  logger.info('Redis client ready before middleware registration');
} catch (e) {
  logger.warn('Redis client failed to initialize early; rate limiting may fallback temporarily', {
    message: e?.message,
  });
}

// Import routes
import authRoutes from './routes/authRoutes.js';
import auctionRoutes from './routes/auctionRoutes.js';
import bidRoutes from './routes/bidRoutes.js';
import userRoutes from './routes/userRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import statsRoutes from './routes/statsRoutes.js';
import webhookRoutes from './routes/webhookRoutes.js';
import watchlistRoutes from './routes/watchlistRoutes.js';
import featuredAuctionRoutes from './routes/featuredAuctionRoutes.js';
import feedbackRoutes from './routes/feedbackRoutes.js';
import emailRoutes from './routes/emailRoute.js';
import { initSocketIO } from './middleware/socketMiddleware.js';

const app = express();

// Enable response compression early to reduce payload sizes for all responses
app.use(compression());

// Configure trust proxy for production
if (env.isProd) {
  // Trust first proxy in production (for secure cookies)
  app.set('trust proxy', 1);
} else {
  // Disable trust proxy in development for safety
  app.disable('trust proxy');
}

// Apply security middleware (includes cookie parsing, CORS, etc.)
app.use(securityMiddleware);

// Add cache-related headers for GET responses
app.use(cacheHeaders(60));

/*// Apply cache middleware BEFORE routes are mounted so it can intercept responses
app.use(
  cacheMiddleware({
    ttlSeconds: 60,
    skipWhenAuth: false,
    includeUserInCacheKey: true,
    excludePaths: ['/api/v1/auctions'], // Let controllers handle auction caching
  })
);*/
//cache is applied within individual routes/controllers as needed so req.user is always available

// Serve API documentation
app.use('/api/v1/docs', apiDocsRouter);

// Enhanced API request/response logging
app.use(apiLogger);

// Body parser (as a backup, though it's also in security middleware)
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Apply requestId context middleware
app.use(requestContextMiddleware);

// Apply HTTP logger
app.use(httpLogger);

// Request logging
app.use(requestLogger);

// Health check endpoint
app.get('/health/server', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: env.nodeEnv || 'development',
  });
});

import { getQueueMetrics } from './services/emailQueueService.js';
app.get('/health/queue', async (req, res, next) => {
  try {
    const metrics = await getQueueMetrics();
    res.json({
      status: 'healthy',
      queue: 'email',
      metrics: {
        waiting: metrics.waiting,
        deadLetter: metrics.deadLetter,
        isOverloaded: metrics.waiting > 1000,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Error logging (should be before global error handler)
app.use(errorLogger);

// API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/auctions', auctionRoutes);
app.use('/api/v1/bids', bidRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/stats', statsRoutes);
app.use('/api/v1/webhook', webhookRoutes);
app.use('/api/v1/watchlist', watchlistRoutes);
app.use('/api/v1/featured-auctions', featuredAuctionRoutes);
app.use('/api/v1/feedback', feedbackRoutes);
app.use('/api/v1/email', emailRoutes);

// Create HTTP server and initialize Socket.IO
const server = http.createServer(app);
const io = initSocketIO(server);

// Make io available in app locals
app.set('io', io);

// Serve static assets in production
if (env.isProd) {
  // Set static folder
  app.use(express.static(join(__dirname, '../../client/build')));

  app.use((req, res) => {
    res.sendFile(join(__dirname, '../../client/build', 'index.html'));
  });
}

// 404 handler
app.use((req, res, next) => {
  next(new AppError('ROUTE_NOT_FOUND', `Can't find ${req.originalUrl} on this server!`, 404));
});

// Global error handler
app.use(globalErrorHandler);

// Error handling for uncaught exceptions and unhandled rejections
process.on('uncaughtException', error => {
  logger.error('Uncaught Exception:', error);
  // In production, you might want to gracefully shut down
  if (env.isProd) {
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  // Log as much useful information as possible to trace the source of the rejection
  try {
    const serializedReason =
      reason instanceof Error ? { message: reason.message, stack: reason.stack } : reason;
    logger.error('Unhandled Rejection', { reason: serializedReason, promise: String(promise) });
  } catch (logErr) {
    // Fallback logger if serialization fails
    logger.error('Unhandled Rejection (could not serialize reason)', { reason, promise });
  }

  // In production, fail fast after logging so monitoring can capture the error
  if (env.isProd) {
    // give logger a moment to flush
    setTimeout(() => process.exit(1), 100);
  }
});

// Also capture Node warnings which may contain helpful stack traces
process.on('warning', warning => {
  try {
    logger.warn('Node warning', {
      name: warning.name,
      message: warning.message,
      stack: warning.stack,
    });
  } catch (err) {
    logger.warn('Node warning (could not serialize)', { warning });
  }
});

// Health-check: ensure Redis/Bull queue connectivity
try {
  const queue = await getEmailQueue();
  await queue.isReady();
  logger.info('Redis (Bull) connected', {
    host: env.redis?.host || '127.0.0.1',
    port: env.redis?.port || 6379,
  });
} catch (redisErr) {
  logger.error('Redis (Bull) not ready or failed to connect:', redisErr);
  if (env.isProd) {
    process.exit(1);
  }
}

// Start server
const PORT = env.port || 5001;
const HOST = env.host || 'localhost';
server.listen(PORT, HOST, () => {
  logger.info(`Server running in ${env.nodeEnv} mode on port ${PORT}`);
  logger.info(`API Documentation available at: http://${HOST}:${PORT}/api/v1/docs`);
  logMemoryUsage('After server start');
});

// Graceful shutdown
let isShuttingDown = false;
const shutdown = async () => {
  if (isShuttingDown) {
    // Prevent duplicate shutdown attempts (e.g., SIGINT and SIGTERM both firing)
    logger.info('Shutdown already in progress, ignoring duplicate signal');
    return;
  }
  isShuttingDown = true;

  logger.info('Shutting down server...');

  const completeShutdown = async () => {
    // Close Bull queues (waits for active jobs to finish)
    logger.info('Closing Bull queues...');
    await closeQueues();

    // Close queue pubsub
    logger.info('Closing QueuePubSub connections...');
    await pubsub.close();

    // Close shared Redis client (used by rate limiter)
    logger.info('Closing Redis client...');
    await closeRedisClient();

    // Final confirmation log
    logger.info('Server successfully shut down');

    // Flush logger transports before exiting to ensure final logs are written
    loggerClose();

    // Allow I/O to flush
    await new Promise(resolve => setTimeout(resolve, 50));

    process.exit(0);
  };

  // Close the server if listening, otherwise proceed directly
  if (server.listening) {
    server.close(async err => {
      if (err) {
        logger.error('Error during server shutdown:', err);
        process.exit(1);
      }
      await completeShutdown();
    });
  } else {
    logger.info('HTTP server not running, proceeding with shutdown');
    await completeShutdown();
  }

  // Force close server after 5 seconds
  setTimeout(() => {
    logger.error('Forcing server shutdown after timeout');
    process.exit(1);
  }, 5000);
};

// Handle signals
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export { app, io };
