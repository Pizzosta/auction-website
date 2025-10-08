import { Server as SocketIO } from 'socket.io';
import logger from '../utils/logger.js';
import { env, validateEnv } from '../config/env.js';
import prisma from '../config/prisma.js';
import jwt from 'jsonwebtoken';
import { findUserById } from '../controllers/userController.js';
import { placeBidCore } from '../controllers/bidController.js';

// Validate environment variables at module load
const missingVars = validateEnv();
if (missingVars.length > 0) {
  logger.error(`Missing required environment variables: ${missingVars.join(', ')}`);
  process.exit(1);
}

// Global state - moved outside functions for persistence
const auctionTimers = new Map();  // auctionId -> { timer, endTime, interval }
const userRooms = new Map();      // userId -> Set of auctionIds
const auctionRooms = new Map();   // auctionId -> { bidders: Set<userId>, viewers: number }

// Statistics tracking
const socketStats = {
  totalConnections: 0,
  peakConnections: 0,
  totalDisconnections: 0,
  errors: 0,
  roomJoins: 0,
  bidsPlaced: 0
};

// Authentication middleware for Socket.IO
const authenticateSocket = async (socket, next) => {
  try {
    // Get token from handshake or query params
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.query?.token ||
      (socket.handshake.headers.authorization || '').split(' ')[1];

    if (!token) {
      logger.info('No authentication token provided - treating socket as Guest', {
        socketId: socket.id,
      });
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
    const user = await findUserById(decoded.userId);

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
      isVerified: user.isVerified,
    };

    logger.info('User authenticated successfully - treating as User', {
      socketId: socket.id,
      userId: user.id,
      email: user.email,
      username: user.username,
      isVerified: user.isVerified,
    });

    next();
  } catch (error) {
    logger.error('Socket authentication middleware error - treating as Guest', {
      error: error.message,
      socketId: socket.id,
      stack: error.stack,
    });
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

// Error boundary wrapper for map operations
const safeMapOperation = (operationName, operation) => {
  try {
    return operation();
  } catch (error) {
    logger.error('Map operation failed', {
      error: error.message,
      operation: operationName,
      stack: error.stack
    });
    socketStats.errors++;
    throw error;
  }
};

// Memory leak protection - periodic cleanup for stale data
const cleanupStaleRooms = () => {
  const now = Date.now();
  const STALE_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours

  logger.info('Running stale room cleanup', {
    timestamp: new Date().toISOString(),
    userRoomsCount: userRooms.size,
    auctionRoomsCount: auctionRooms.size
  });

  safeMapOperation('cleanupStaleRooms', () => {
    // Clean up userRooms for users with no active rooms
    for (const [userId, rooms] of userRooms.entries()) {
      if (rooms.size === 0) {
        userRooms.delete(userId);
        logger.debug('Cleaned up empty user room', { userId });
      }
    }

    // Clean up empty auction rooms
    for (const [auctionId, room] of auctionRooms.entries()) {
      if (room.bidders.size === 0 && room.viewers === 0) {
        auctionRooms.delete(auctionId);
        logger.debug('Cleaned up empty auction room', { auctionId });
      }
    }

    // Clean up expired timers
    for (const [auctionId, timerData] of auctionTimers.entries()) {
      if (timerData.endTime && new Date(timerData.endTime) < new Date()) {
        if (timerData.timer) clearTimeout(timerData.timer);
        if (timerData.interval) clearInterval(timerData.interval);
        auctionTimers.delete(auctionId);
        logger.debug('Cleaned up expired auction timer', { auctionId });
      }
    }
  });
};

// Statistics tracking function
const getRoomStats = () => ({
  totalUsers: userRooms.size,
  totalAuctions: auctionRooms.size,
  totalConnections: Array.from(auctionRooms.values()).reduce(
    (sum, room) => sum + room.bidders.size + room.viewers, 0
  ),
  activeTimers: auctionTimers.size,
  systemStats: { ...socketStats }
});

// Export global state for monitoring
export const getSocketStats = getRoomStats;
export { userRooms, auctionRooms, auctionTimers };

// Function to schedule auction ending notifications
const scheduleAuctionEndingNotification = (io, auctionId, endTime, auctionRooms) => {
  safeMapOperation('scheduleAuctionEndingNotification', () => {
    // Clear any existing timer for this auction
    if (auctionTimers.has(auctionId)) {
      const { timer, interval } = auctionTimers.get(auctionId);
      if (timer) clearTimeout(timer);
      if (interval) clearInterval(interval);
      auctionTimers.delete(auctionId);
    }

    const now = new Date();
    const endDate = new Date(endTime);
    const timeUntilEnd = endDate - now;
    const fifteenMinutes = 15 * 60 * 1000; // 15 minutes in milliseconds

    // Only schedule if more than 15 minutes remaining
    if (timeUntilEnd > fifteenMinutes) {
      const timeUntilNotification = timeUntilEnd - fifteenMinutes;

      const timer = setTimeout(async () => {
        try {
          // Get latest auction data
          const auction = await prisma.auction.findUnique({
            where: { id: auctionId },
            select: {
              id: true,
              title: true,
              currentPrice: true,
              highestBid: {
                select: {
                  bidderId: true
                }
              },
              endDate: true
            }
          });

          if (!auction) return;

          // Notify all users in the auction room
          io.to(auctionId).emit('auctionEnding', {
            auctionId,
            title: auction.title,
            currentPrice: auction.currentPrice,
            timeRemaining: '15 minutes',
            endsAt: auction.endDate
          });

          // Start countdown
          startAuctionCountdown(io, auctionId, endDate, auctionRooms);

        } catch (error) {
          logger.error('Error in auction ending notification', {
            auctionId,
            error: error.message
          });
          socketStats.errors++;
        }
      }, timeUntilNotification);

      auctionTimers.set(auctionId, { timer, endTime: endDate });
    } else if (timeUntilEnd > 0) {
      // If less than 15 minutes but still active, start countdown
      startAuctionCountdown(io, auctionId, endDate, auctionRooms);
    }
  });
};

// Handle auction won notification
const handleAuctionWon = async (io, auctionId, auction) => {
  if (!auction?.highestBid?.bidderId) {
    logger.info('No winner for auction', { auctionId });
    return;
  }

  try {
    const winnerId = auction.highestBid.bidderId;

    // Notify the winner
    const winnerSocket = Array.from(io.sockets.sockets.values())
      .find(socket => socket.user?.id === winnerId);

    if (winnerSocket) {
      winnerSocket.emit('auctionWon', {
        auctionId,
        title: auction.title,
        finalPrice: auction.currentPrice,
        wonAt: new Date().toISOString(),
        auction
      });

      logger.info('Auction won notification sent', {
        auctionId,
        winnerId,
        socketId: winnerSocket.id
      });
    } else {
      logger.info('Auction winner not connected', {
        auctionId,
        winnerId
      });
    }

    // Notify all watchers
    await notifyAuctionWatchers(io, auctionId, auctionDetails, winnerId);

  } catch (error) {
    logger.error('Error handling auction won', {
      error: error.message,
      auctionId,
      stack: error.stack
    });
  }
};

// Notify all users who were watching this auction
const notifyAuctionWatchers = async (io, auctionId, auctionDetails, winnerId) => {
  try {
    // Get all users who have this auction in their watchlist
    const watchers = await prisma.watchlist.findMany({
      where: {
        auctionId,
        userId: { not: winnerId } // Don't notify the winner again
      },
      select: {
        userId: true,
        user: {
          select: {
            id: true,
            email: true,
            username: true
          }
        }
      }
    });

    // Emit to all connected watchers
    watchers.forEach(({ userId, user }) => {
      const watcherSocket = Array.from(io.sockets.sockets.values())
        .find(socket => socket.user?.id === userId);

      if (watcherSocket) {
        watcherSocket.emit('auctionYouWatchedEnded', {
          auctionId,
          title: auction.title,
          finalPrice: auction.currentPrice,
          winnerId,
          isWinner: false,
          endedAt: new Date().toISOString()
        });
      }
    });

    logger.info('Notified auction watchers', {
      auctionId,
      watcherCount: watchers.length,
      winnerId
    });

  } catch (error) {
    logger.error('Error notifying auction watchers', {
      error: error.message,
      auctionId,
      stack: error.stack
    });
  }
};

// Helper function for final countdown notifications
const startAuctionCountdown = (io, auctionId, endTime, auctionRooms) => {
  safeMapOperation('startAuctionCountdown', () => {
    if (auctionTimers.has(auctionId) && auctionTimers.get(auctionId).interval) {
      return; // Countdown already started
    }

    const updateCountdown = () => {
      const now = new Date();
      const timeUntilEnd = new Date(endTime) - now;

      if (timeUntilEnd <= 0) {
        // Get final auction details
        prisma.auction.findUnique({
          where: { id: auctionId },
          select: {
            id: true,
            title: true,
            currentPrice: true,
            highestBid: {
              select: {
                bidderId: true
              }
            },
            endDate: true,
            status: true,
            sellerId: true
          }
        }).then(auction => {
          if (!auction) {
            logger.error('Auction not found when ending', { auctionId });
            return;
          }

          // Emit to all in the auction room
          io.to(auctionId).emit('auctionEnded', {
            auctionId,
            winnerId: auction.highestBid?.bidderId,
            finalPrice: auction.currentPrice,
            endedAt: new Date().toISOString()
          });

          // Handle winner notification
          if (auction.highestBid?.bidderId) {
            handleAuctionWon(io, auctionId, auction);
          }

          // Update auction status in database
          prisma.auction.update({
            where: { id: auctionId },
            data: { status: 'ended' }
          }).catch(error => {
            logger.error('Error updating auction status to ENDED', {
              error: error.message,
              auctionId
            });
          });

        }).catch(error => {
          logger.error('Error fetching auction details on end', {
            error: error.message,
            auctionId,
            stack: error.stack
          });
        });

        // Clean up
        const timerData = auctionTimers.get(auctionId);
        if (timerData) {
          if (timerData.interval) clearInterval(timerData.interval);
          auctionTimers.delete(auctionId);
        }

        // Clean up room after a delay
        setTimeout(() => {
          safeMapOperation('auctionEndCleanup', () => {
            if (auctionRooms.has(auctionId)) {
              auctionRooms.delete(auctionId);
            }
          });
        }, 60000); // 1 minute after end

        return;
      }

      // Emit countdown updates at specific intervals
      const minutes = Math.floor(timeUntilEnd / (60 * 1000));
      const seconds = Math.floor((timeUntilEnd % (60 * 1000)) / 1000);

      // Only emit at specific intervals to reduce traffic
      if (minutes > 0 && seconds === 0) {
        if (minutes <= 5 && minutes % 1 === 0) {
          // Every minute in last 5 minutes
          io.to(auctionId).emit('auctionCountdown', {
            auctionId,
            timeRemaining: `${minutes} minute${minutes !== 1 ? 's' : ''}`,
            secondsRemaining: Math.floor(timeUntilEnd / 1000),
            timestamp: now.toISOString()
          });
        }
      } else if (timeUntilEnd <= 30000 && timeUntilEnd % 10000 < 1000) {
        // Every 10 seconds in last 30 seconds
        io.to(auctionId).emit('auctionCountdown', {
          auctionId,
          timeRemaining: `${Math.ceil(timeUntilEnd / 1000)} seconds`,
          secondsRemaining: Math.ceil(timeUntilEnd / 1000),
          timestamp: now.toISOString()
        });
      }
    };

    // Update immediately and then every second
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);

    // Store interval for cleanup
    const timerData = auctionTimers.get(auctionId) || {};
    auctionTimers.set(auctionId, { ...timerData, interval });
  });
};

// Clean up timers on server shutdown
const cleanupTimers = () => {
  safeMapOperation('cleanupTimers', () => {
    for (const { timer, interval } of auctionTimers.values()) {
      if (timer) clearTimeout(timer);
      if (interval) clearInterval(interval);
    }
    auctionTimers.clear();
    logger.info('All auction timers cleaned up');
  });
};

// Initialize Socket.IO with the HTTP server
export const initSocketIO = server => {
  const io = new SocketIO(server, {
    cors: {
      origin: env.clientUrl || 'http://localhost:5173',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 30000, // 30 seconds
    pingInterval: 25000, // 25 seconds
    transports: ['websocket', 'polling'],
  });

  // Apply socket middleware
  io.use(rateLimit()); // 100 requests per minute per IP
  io.use(authenticateSocket);

  // Start periodic cleanup (run every hour)
  const cleanupInterval = setInterval(cleanupStaleRooms, 60 * 60 * 1000);

  // Connection handler
  io.on('connection', socket => {
    const userId = socket.user?.id || `guest-${socket.id}`;

    // Update statistics
    socketStats.totalConnections++;
    socketStats.peakConnections = Math.max(socketStats.peakConnections, socketStats.totalConnections);

    logger.info('New client connected', {
      socketId: socket.id,
      userId,
      totalConnections: socketStats.totalConnections,
      peakConnections: socketStats.peakConnections
    });

    // Initialize user's room set if authenticated
    safeMapOperation('userRoomInit', () => {
      if (socket.user?.id && !userRooms.has(socket.user.id)) {
        userRooms.set(socket.user.id, new Set());
      }
    });

    // Join personal room for authenticated users/ private messages
    if (socket.user?.id) {
      socket.join(`user:${socket.user.id}`);
      logger.info(`User ${socket.user.id} joined personal room`, {
        userId: socket.user.id,
        socketId: socket.id,
      });
    }

    // Handle joining an auction room with validation AND real-time room management
    socket.on('joinAuction', async (auctionId, callback) => {
      try {
        if (!auctionId) {
          throw new Error('Auction ID is required');
        }

        // Verify user has access to this auction
        const auction = await prisma.auction.findUnique({
          where: { id: auctionId, isDeleted: false },
          select: {
            id: true,
            status: true,
            endDate: true,
            title: true,
            currentPrice: true,
            highestBid: {
              select: {
                bidderId: true
              }
            },
          }
        });

        if (!auction) {
          throw new Error('Auction not found');
        }

        // Schedule auction ending notifications if active
        if (auction.status === 'active') {
          scheduleAuctionEndingNotification(io, auctionId, auction.endDate, auctionRooms);
        }

        // Join the auction room
        socket.join(auctionId);

        safeMapOperation('joinAuctionRoom', () => {
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

          // Update statistics
          socketStats.roomJoins++;

          logger.info(`User ${userId} joined auction ${auctionId}`, {
            socketId: socket.id,
            userId,
            auctionId,
            bidders: room.bidders.size,
            viewers: room.viewers,
            total: room.bidders.size + room.viewers,
          });

          // Broadcast updated viewer count
          io.to(auctionId).emit('viewerCount', {
            auctionId,
            count: room.bidders.size + room.viewers,
            bidders: room.bidders.size,
            viewers: room.viewers,
          });
        });

        if (typeof callback === 'function') {
          callback({ status: 'success', auctionId });
        }
      } catch (error) {
        logger.error('Error joining auction room', {
          error: error.message,
          socketId: socket.id,
          userId,
          auctionId,
        });
        socketStats.errors++;

        if (typeof callback === 'function') {
          callback({
            status: 'error',
            message: error.message || 'Failed to join auction',
          });
        }
      }
    });

    // Handle auction won acknowledgment
    socket.on('acknowledgeAuctionWon', async ({ auctionId }) => {
      try {
        if (!socket.user?.id) {
          throw new Error('Authentication required');
        }

        logger.info('User acknowledged auction won', {
          userId: socket.user.id,
          auctionId
        });

        // Here you could update a notification as 'read' in the database
        // await markNotificationAsRead(socket.user.id, auctionId, 'auctionWon');

      } catch (error) {
        logger.error('Error acknowledging auction won', {
          error: error.message,
          userId: socket.user?.id,
          auctionId,
          stack: error.stack
        });
      }
    });

    // Handle placing a bid
    socket.on('placeBid', async (data, callback) => {
      try {
        if (!socket.user || !socket.user.id) {
          throw new Error('Authentication required to place a bid');
        }
        const { auctionId, amount } = data;
        const actorId = socket.user.id;
        const result = await placeBidCore({ auctionId, amount, actorId, io, socket });

        // Update statistics
        socketStats.bidsPlaced++;

        if (typeof callback === 'function') {
          callback({ status: 'success', bid: result });
        }
      } catch (error) {
        if (typeof callback === 'function') {
          callback({ status: 'error', message: error.message });
        }
        logger.error('Socket placeBid error', {
          socketId: socket.id,
          userId: socket.user?.id,
          error: error.message,
        });
        socketStats.errors++;
      }
    });

    // Handle leaving auction rooms
    socket.on('leaveAuction', auctionId => {
      if (!auctionId) return;

      socket.leave(auctionId);

      safeMapOperation('leaveAuction', () => {
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
            viewers: room.viewers,
          });

          // Update viewer count for remaining participants
          io.to(auctionId).emit('viewerCount', {
            auctionId,
            count: room.bidders.size + room.viewers,
            bidders: room.bidders.size,
            viewers: room.viewers,
          });

          // Clean up empty rooms
          if (room.bidders.size === 0 && room.viewers === 0) {
            auctionRooms.delete(auctionId);
          }
        }
      });
    });

    // Handle disconnection cleanup
    socket.on('disconnect', reason => {
      socketStats.totalDisconnections++;

      logger.info('Client disconnected', {
        socketId: socket.id,
        userId,
        reason,
        activeConnections: socketStats.totalConnections - socketStats.totalDisconnections
      });

      safeMapOperation('disconnectCleanup', () => {
        // Clean up user from all auction rooms
        if (socket.user?.id && userRooms.has(socket.user.id)) {
          const userAuctionRooms = userRooms.get(socket.user.id);

          userAuctionRooms.forEach(auctionId => {
            if (auctionRooms.has(auctionId)) {
              const room = auctionRooms.get(auctionId);
              room.bidders.delete(socket.user.id);

              // Update viewer count for remaining participants
              io.to(auctionId).emit('viewerCount', {
                auctionId,
                count: room.bidders.size + room.viewers,
                bidders: room.bidders.size,
                viewers: room.viewers,
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

            io.to(auctionId).emit('viewerCount', {
              auctionId,
              count: room.bidders.size + room.viewers,
              bidders: room.bidders.size,
              viewers: room.viewers,
            });

            if (room.bidders.size === 0 && room.viewers === 0) {
              auctionRooms.delete(auctionId);
            }
          });
        }
      });
    });

    // Error handling
    socket.on('error', error => {
      logger.error('Socket error', {
        socketId: socket.id,
        error: error.message,
        stack: error.stack,
      });
      socketStats.errors++;
    });
  });

  // Handle server shutdown
  const handleShutdown = async () => {
    logger.info('Shutting down Socket.IO server...', {
      stats: getRoomStats()
    });

    cleanupTimers();

    // Clear the cleanup interval
    if (cleanupInterval) {
      clearInterval(cleanupInterval);
    }

    // Notify all clients
    io.emit('serverShutdown', {
      message: 'Server is shutting down',
      timestamp: new Date().toISOString()
    });

    // Close all connections
    io.sockets.sockets.forEach(socket => socket.disconnect(true));

    // Close the server
    io.close(() => {
      logger.info('Socket.IO server closed', {
        finalStats: getRoomStats()
      });
      process.exit(0);
    });
  };

  // Handle graceful shutdown
  process.on('SIGTERM', handleShutdown);
  process.on('SIGINT', handleShutdown);

  // Handle global errors
  io.on('error', error => {
    logger.error('Socket.IO server error', {
      error: error.message,
      stack: error.stack,
    });
    socketStats.errors++;
  });

  // Log statistics periodically (optional, for monitoring)
  setInterval(() => {
    logger.info('Socket.IO Statistics', getRoomStats());
  }, 15 * 60 * 1000); // Every 15 minutes

  return io;
};