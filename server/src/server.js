import dotenv from 'dotenv';
import express from 'express';
import http from 'http';
import { Server as SocketIO } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import logger from './utils/logger.js';
import requestLogger from './middleware/requestLogger.js';
import securityMiddleware from './middleware/security.js';
import { globalErrorHandler, AppError } from './middleware/errorHandler.js';
import './jobs/index.js'; // Import jobs to start the scheduler

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config();

// Validate required environment variables
const requiredEnvVars = ['MONGODB_URI', 'JWT_SECRET', 'NODE_ENV', 'PORT', 'CLIENT_URL'];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
  logger.error(`Missing required environment variables: ${missingVars.join(', ')}`);
  process.exit(1);
}

// Import database connection
import connectDB from './config/db.js';

// Initialize database connection
connectDB();

// Import routes
import authRoutes from './routes/authRoutes.js';
import auctionRoutes from './routes/auctionRoutes.js';
import bidRoutes from './routes/bidRoutes.js';
import userRoutes from './routes/userRoutes.js';

const app = express();
const server = http.createServer(app);
const io = new SocketIO(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
  },
});

// Middleware to parse JSON bodies. This is crucial for req.body to not be undefined.
app.use(express.json());

// Configure trust proxy for production
if (process.env.NODE_ENV === 'production') {
  // Trust only the specific proxy in production
  app.set('trust proxy', 1); // trust first proxy
} else {
  // Disable trust proxy in development for safety
  app.disable('trust proxy');
}

// Apply security middleware
app.use(securityMiddleware);

// Request logging
app.use(requestLogger);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/auctions', auctionRoutes);
app.use('/api/bids', bidRoutes);
app.use('/api/users', userRoutes);

// Serve static assets in production
if (process.env.NODE_ENV === 'production') {
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
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // In production, you might want to gracefully shut down
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

// Start server
const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
  logger.info(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
  logger.info(`API Documentation available at: http://localhost:${PORT}/api-docs`);
});

// Graceful shutdown
const shutdown = async () => {
  logger.info('Shutting down server...');

  // Close the server
  server.close(async err => {
    if (err) {
      logger.error('Error during server shutdown:', err);
      process.exit(1);
    }

    // Close database connection
    try {
      const { connection } = await import('mongoose');
      await connection.close();
      logger.info('MongoDB connection closed');
    } catch (dbError) {
      logger.error('Error closing MongoDB connection:', dbError);
    }

    logger.info('Server successfully shut down');
    process.exit(0);
  });

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
