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
      // No token → allow guest
      logger.info('No authentication token provided - treating socket as Guest', { socketId: socket.id });
      socket.user = null;
      return next();
    }

    // Verify JWT
    let decoded;
    try {
      decoded = jwt.verify(token, env.jwtSecret);
    } catch (err) {
      logger.warn('Invalid token - treating socket as Guest', {
        socketId: socket.id,
        error: err.message,
      });
      socket.user = null;
      return next();
    }

    // Get user from database
    const user = await getUserById(decoded.id);

    if (!user || user.isDeleted) {
      logger.warn('User not found or deactivated - treating socket as Guest', {
        socketId: socket.id,
        userId: decoded.id,
      });
      socket.user = null;
      return next();
    }

    // Attach authenticated user to socket
    socket.user = {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      isVerified: user.isVerified
    };

    logger.info('User authenticated successfully - treating as User', {
      socketId: socket.id,
      userId: user.id,
      email: user.email,
      username: user.username,
      isVerified: user.isVerified
    });

    next();
  } catch (error) {
    logger.error('Socket authentication middleware error - treating as Guest', {
      error: error.message,
      socketId: socket.id,
      stack: error.stack
    });

    // In case of unexpected errors, still allow guest
    socket.user = null;
    return next();
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
    pingTimeout: 30000, // 30 seconds
    pingInterval: 25000, // 25 seconds
    transports: ['websocket', 'polling']
  });

  // Apply socket middleware
  io.use(rateLimit()); // 100 requests per minute per IP
  io.use(authenticateSocket);

  // Global maps for room tracking
  const userRooms = new Map();     // userId -> Set of auctionIds
  const auctionRooms = new Map();  // auctionId -> { bidders: Set<userId>, viewers: number }

  // Connection handler
  io.on('connection', (socket) => {
    const userId = socket.user?.id || `guest-${socket.id}`;
    logger.info('New client connected', { socketId: socket.id, userId });

    // Initialize user's room set if authenticated
    if (socket.user?.id && !userRooms.has(socket.user.id)) {
      userRooms.set(socket.user.id, new Set());
    }

    // Join personal room for authenticated users/ private messages
    if (socket.user?.id) {
      socket.join(`user:${socket.user.id}`);
      logger.info(`User ${socket.user.id} joined personal room`, { userId: socket.user.id, socketId: socket.id });
    }

    // Handle joining an auction room with validation AND real-time room management
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

        // Join the auction room
        socket.join(auctionId);

        // Initialize auction room tracking if needed
        if (!auctionRooms.has(auctionId)) {
          auctionRooms.set(auctionId, { bidders: new Set(), viewers: 0 });
        }

        const room = auctionRooms.get(auctionId);

        // Track if this is a bidder or just a viewer
        if (socket.user?.id) {
          room.bidders.add(socket.user.id);
          // Track this auction in user's room set
          userRooms.get(socket.user.id)?.add(auctionId);
        } else {
          room.viewers++;
        }

        logger.info(`User ${userId} joined auction ${auctionId}`, {
          socketId: socket.id,
          userId,
          auctionId,
          bidders: room.bidders.size,
          viewers: room.viewers,
          total: room.bidders.size + room.viewers
        });

        // Broadcast updated viewer count
        io.to(auctionId).emit('viewerCount', {
          auctionId,
          count: room.bidders.size + room.viewers,
          bidders: room.bidders.size,
          viewers: room.viewers
        });

        if (typeof callback === 'function') {
          callback({ status: 'success', auctionId });
        }
      } catch (error) {
        logger.error('Error joining auction room', {
          error: error.message,
          socketId: socket.id,
          userId,
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

    // Handle leaving auction rooms
    socket.on('leaveAuction', (auctionId) => {
      if (!auctionId) return;

      socket.leave(auctionId);

      if (auctionRooms.has(auctionId)) {
        const room = auctionRooms.get(auctionId);

        // Remove user from tracking
        if (socket.user?.id) {
          room.bidders.delete(socket.user.id);
          userRooms.get(socket.user.id)?.delete(auctionId);
        } else {
          room.viewers = Math.max(0, room.viewers - 1);
        }

        logger.info(`User ${userId} left auction ${auctionId}`, {
          socketId: socket.id,
          auctionId,
          bidders: room.bidders.size,
          viewers: room.viewers
        });

        // Update viewer count for remaining participants
        io.to(auctionId).emit("viewerCount", {
          auctionId,
          count: room.bidders.size + room.viewers,
          bidders: room.bidders.size,
          viewers: room.viewers
        });

        // Clean up empty rooms
        if (room.bidders.size === 0 && room.viewers === 0) {
          auctionRooms.delete(auctionId);
        }
      }
    });

    // Handle disconnection cleanup
    socket.on('disconnect', (reason) => {
      logger.info('Client disconnected', {
        socketId: socket.id,
        userId,
        reason
      });

      // Clean up user from all auction rooms
      if (socket.user?.id && userRooms.has(socket.user.id)) {
        const userAuctionRooms = userRooms.get(socket.user.id);

        userAuctionRooms.forEach(auctionId => {
          if (auctionRooms.has(auctionId)) {
            const room = auctionRooms.get(auctionId);
            room.bidders.delete(socket.user.id);

            // Update viewer count for remaining participants
            io.to(auctionId).emit("viewerCount", {
              auctionId,
              count: room.bidders.size + room.viewers,
              bidders: room.bidders.size,
              viewers: room.viewers
            });

            // Clean up empty rooms
            if (room.bidders.size === 0 && room.viewers === 0) {
              auctionRooms.delete(auctionId);
            }
          }
        });

        // Remove user from userRooms
        userRooms.delete(socket.user.id);
      }

      // Clean up guest viewers
      if (!socket.user?.id) {
        auctionRooms.forEach((room, auctionId) => {
          room.viewers = Math.max(0, room.viewers - 1);

          io.to(auctionId).emit("viewerCount", {
            auctionId,
            count: room.bidders.size + room.viewers,
            bidders: room.bidders.size,
            viewers: room.viewers
          });

          if (room.bidders.size === 0 && room.viewers === 0) {
            auctionRooms.delete(auctionId);
          }
        });
      }
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
