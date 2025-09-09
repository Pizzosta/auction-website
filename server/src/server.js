import express from 'express';
import apiDocsRouter from './apiDocs.js';
import http from 'http';
import { Server as SocketIO } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import logger from './utils/logger.js';
import requestLogger from './middleware/requestLogger.js';
import securityMiddleware from './middleware/security.js';
import { apiLogger, errorLogger } from './middleware/apiLogger.js';
import { globalErrorHandler, AppError } from './middleware/errorHandler.js';
import './jobs/index.js'; // Import jobs to start the scheduler
import { requestContextMiddleware } from './middleware/requestContext.js';
import { httpLogger } from './utils/logger.js';
import { env, validateEnv } from './config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Validate required environment variables once at startup
const missingVars = validateEnv();
if (missingVars.length > 0) {
  logger.error(`Missing required environment variables: ${missingVars.join(', ')}`);
  process.exit(1);
}

// Import database connection
import connectDB from './config/db.js';
// Initialize database connection
connectDB();

// Then import and initialize Cloudinary
import initializeCloudinary from './config/cloudinary.js';
import { getRedisClient } from './config/redis.js';
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
  logger.warn('Redis client failed to initialize early; rate limiting may fallback temporarily', { message: e?.message });
}

// Import routes
import authRoutes from './routes/authRoutes.js';
import auctionRoutes from './routes/auctionRoutes.js';
import bidRoutes from './routes/bidRoutes.js';
import userRoutes from './routes/userRoutes.js';
import webhookRoutes from './routes/webhookRoutes.js';

const app = express();
const server = http.createServer(app);
// Serve API documentation
app.use('/api-docs', apiDocsRouter);
const io = new SocketIO(server, {
  cors: {
    origin: env.clientUrl || 'http://localhost:5173',
    methods: ['GET', 'POST'],
  },
});

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
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: env.nodeEnv || 'development',
  });
});

// Error logging (should be before global error handler)
app.use(errorLogger);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/auctions', auctionRoutes);
app.use('/api/bids', bidRoutes);
app.use('/api/users', userRoutes);
app.use('/api/v1/webhook', webhookRoutes);

// Serve static assets in production
if (env.isProd) {
  // Set static folder
  app.use(express.static(join(__dirname, '../../client/build')));

  app.use((req, res) => {
    res.sendFile(join(__dirname, '../../client/build', 'index.html'));
  });
}

// Socket.io for real-time bidding
const wrap = middleware => (socket, next) => middleware(socket.request, {}, next);

io.use(wrap(express.json()));
io.use(wrap(express.urlencoded({ extended: true })));

io.on('connection', socket => {
  logger.info('New client connected');

  // Join auction room
  socket.on('joinAuction', auctionId => {
    socket.join(auctionId);
    logger.info(`User joined auction: ${auctionId}`);
  });

  // Handle new bid
  socket.on('placeBid', data => {
    io.to(data.auctionId).emit('newBid', data);
  });

  socket.on('disconnect', () => {
    logger.info('Client disconnected');
  });
});

// Store io instance in app for use in controllers
app.set('io', io);

// 404 handler
app.use((req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
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
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // In production, you might want to gracefully shut down
  if (env.isProd) {
    process.exit(1);
  }
});

// Health-check: ensure Redis/Bull queue connectivity
try {
  const { emailQueue } = await import('./services/emailQueue.js');
  await emailQueue.isReady();
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
server.listen(PORT, () => {
  logger.info(`Server running in ${env.nodeEnv} mode on port ${PORT}`);
  logger.info(`API Documentation available at: http://localhost:${PORT}/api-docs`);
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
    // Close database connection
    try {
      const mongooseModule = await import('mongoose');
      const mongoose = mongooseModule.default || mongooseModule;
      const conn = mongoose.connection;
      if (conn && typeof conn.close === 'function') {
        await conn.close();
        logger.info('MongoDB connection closed');
      } else {
        logger.warn('MongoDB connection not available or already closed');
      }
    } catch (dbError) {
      logger.error('Error closing MongoDB connection:', dbError);
    }

    // Close Redis/Bull queues
    try {
      const { emailQueue } = await import('./services/emailQueue.js');
      if (emailQueue && typeof emailQueue.close === 'function') {
        // Wait for active jobs to finish; pass true to not wait if you want faster exits
        await emailQueue.close();
        logger.info('Email queue closed');
      } else {
        logger.warn('Email queue not available or already closed');
      }
    } catch (queueError) {
      logger.error('Error closing email queue:', queueError);
    }

    // Close shared Redis client (used by rate limiter)
    try {
      const { getRedisClient } = await import('./config/redis.js');
      const client = await getRedisClient();
      if (client) {
        await client.quit();
        logger.info('Redis client closed');
      } else {
        logger.warn('Redis client not available or already closed');
      }
    } catch (redisCloseErr) {
      logger.error('Error closing Redis client:', redisCloseErr);
    }

    // Final confirmation log
    logger.info('Server successfully shut down');

    // Flush logger transports before exiting to ensure final logs are written
    try {
      for (const transport of logger.transports) {
        if (typeof transport.close === 'function') transport.close();
      }
    } catch (e) {
      // ignore transport close errors
    }

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
