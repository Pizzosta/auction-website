import { Server as SocketIO } from 'socket.io';
import logger from '../utils/logger.js';
import { env } from '../config/env.js';
import jwt from 'jsonwebtoken';
import { getUserById } from '../controllers/userController.js';

// Authentication middleware for Socket.IO
const authenticateSocket = async (socket, next) => {
  try {
    // Get token from handshake or query params
    const token = socket.handshake.auth?.token || 
                 socket.handshake.query?.token ||
                 (socket.handshake.headers.authorization || '').split(' ')[1];

    if (!token) {
      logger.warn('No authentication token provided', { socketId: socket.id });
      return next(new Error('Authentication error: No token provided'));
    }

    // Verify JWT
    const decoded = jwt.verify(token, env.jwtSecret);
    
    // Get user from database
    const user = await getUserById(decoded.id);
    
    if (!user || user.isDeleted) {
      logger.warn('User not found or deactivated', { userId: decoded.id });
      return next(new Error('Authentication error: User not found or deactivated'));
    }

    // Attach user to socket for later use
    socket.user = {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      isVerified: user.isVerified
    };

    logger.info('Socket authenticated', { 
      socketId: socket.id, 
      userId: user.id,
      email: user.email,
      username: user.username,
      isVerified: user.isVerified 
    });

    next();
  } catch (error) {
    logger.error('Socket authentication error', { 
      error: error.message,
      socketId: socket.id,
      stack: error.stack 
    });
    
    if (error.name === 'TokenExpiredError') {
      return next(new Error('Authentication error: Token expired'));
    }
    if (error.name === 'JsonWebTokenError') {
      return next(new Error('Authentication error: Invalid token'));
    }
    next(new Error('Authentication error: Unable to authenticate'));
  }
};

// Rate limiting middleware
const rateLimit = (windowMs = 60 * 1000, max = 100) => {
  const connections = new Map();

  return (socket, next) => {
    const ip = socket.handshake.address;
    const now = Date.now();
    const windowStart = now - windowMs;

    if (!connections.has(ip)) {
      connections.set(ip, []);
    }

    const timestamps = connections.get(ip).filter(ts => ts > windowStart);
    timestamps.push(now);
    connections.set(ip, timestamps);

    if (timestamps.length > max) {
      logger.warn('Rate limit exceeded', { ip, count: timestamps.length });
      return next(new Error('Rate limit exceeded'));
    }

    next();
  };
};

// Initialize Socket.IO with the HTTP server
export const initSocketIO = (server) => {
  const io = new SocketIO(server, {
    cors: {
      origin: env.clientUrl || 'http://localhost:5173',
      methods: ['GET', 'POST'],
      credentials: true
    },
    // Optional: Configure ping/pong timeouts
    pingTimeout: 30000, // 30 seconds
    pingInterval: 25000, // 25 seconds
    // Optional: Enable HTTP long-polling fallback
    transports: ['websocket', 'polling']
  });

  // Apply socket middleware
  io.use(rateLimit()); // 100 requests per minute per IP
  io.use(authenticateSocket);

  // Connection handler
  io.on('connection', (socket) => {
    logger.info('New client connected', { socketId: socket.id, userId: socket.user?.id });

    // Handle joinAuction with additional validation
    socket.on('joinAuction', async (auctionId, callback) => {
      try {
        if (!auctionId) {
          throw new Error('Auction ID is required');
        }

        // Verify user has access to this auction
        const auction = await prisma.auction.findUnique({
          where: { id: auctionId, isDeleted: false }
        });

        if (!auction) {
          throw new Error('Auction not found');
        }

        // Additional permission checks can go here
        // For example: is the user the seller or a bidder?

        socket.join(auctionId);
        logger.info(`User ${socket.user.id} joined auction ${auctionId}`, {
          socketId: socket.id,
          auctionId
        });

        if (typeof callback === 'function') {
          callback({ status: 'success', auctionId });
        }
      } catch (error) {
        logger.error('Error joining auction room', {
          error: error.message,
          socketId: socket.id,
          userId: socket.user?.id,
          auctionId
        });
        
        if (typeof callback === 'function') {
          callback({ 
            status: 'error', 
            message: error.message || 'Failed to join auction' 
          });
        }
      }
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      logger.info('Client disconnected', { 
        socketId: socket.id, 
        reason,
        rooms: [...socket.rooms]
      });
    });

    // Error handling
    socket.on('error', (error) => {
      logger.error('Socket error', { 
        socketId: socket.id, 
        error: error.message,
        stack: error.stack 
      });
    });
  });

  // Handle global errors
  io.on('error', (error) => {
    logger.error('Socket.IO server error', { 
      error: error.message,
      stack: error.stack 
    });
  });

  return io;
};
