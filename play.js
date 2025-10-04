// backend/utils/socket.js
const socketIo = require("socket.io");
const jwt = require("jsonwebtoken");

const initSocket = (server, app) => {
  const io = socketIo(server, {
    cors: {
      origin: process.env.FRONTEND_URL || "http://localhost:5173",
      methods: ["GET", "POST"],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000, // 60 seconds
    pingInterval: 25000, // 25 seconds
  });

  // Track connected users and their rooms
  const userRooms = new Map(); // userId -> Set of roomIds
  const auctionRooms = new Map(); // auctionId -> { bidders: Set<userId>, viewers: number }

  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.user = decoded; // Attach user info to socket
        console.log(`User ${socket.user.id} authenticated for socket ${socket.id}`);
      } catch (err) {
        console.warn(`Socket ${socket.id}: Invalid token, treating as Guest. Error: ${err.message}`);
        socket.user = null;
      }
    } else {
      console.log(`Socket ${socket.id}: No token provided, treating as Guest.`);
      socket.user = null;
    }
    next();
  });

  io.on("connection", (socket) => {
    const userId = socket.user?.id || `guest-${socket.id}`;
    console.log(`User connected: ${socket.id} (${userId})`);

    // Initialize user's room set if authenticated
    if (socket.user?.id && !userRooms.has(socket.user.id)) {
      userRooms.set(socket.user.id, new Set());
    }

    // Join user to their personal room for private messages
    if (socket.user?.id) {
      socket.join(`user:${socket.user.id}`);
      console.log(`User ${socket.user.id} joined personal room`);
    }

    // Join an auction room
    socket.on("joinAuctionRoom", (auctionId) => {
      if (!auctionId) return;

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
        userRooms.get(socket.user.id)?.add(auctionId);
      } else {
        room.viewers++;
      }

      console.log(`User ${userId} joined auction ${auctionId} (${room.bidders.size} bidders, ${room.viewers} viewers)`);

      // Update viewer count for all in the room
      io.to(auctionId).emit("viewerCount", {
        auctionId,
        count: room.bidders.size + room.viewers
      });
    });

    // Handle new bid from client
    socket.on("placeBid", async ({ auctionId, bidAmount, userId }) => {
      if (!socket.user || socket.user.id !== userId) {
        return socket.emit("bidError", {
          message: "Authentication required to place a bid"
        });
      }

      try {
        // In a real implementation, you would validate and save the bid to the database here
        // Then emit the appropriate events

        // For now, we'll just broadcast the new bid
        const bidData = {
          auctionId,
          userId,
          bidAmount,
          timestamp: new Date(),
        };

        // Notify all users in the auction room
        io.to(auctionId).emit("bidUpdate", {
          auction: {
            _id: auctionId,
            currentHighestBid: bidAmount,
            currentHighestBidder: userId,
          },
          newBid: bidData,
          previousHighestBid: auctionRooms.get(auctionId)?.currentHighestBid || 0,
        });

        // Notify the previous highest bidder if they've been outbid
        const room = auctionRooms.get(auctionId);
        if (room?.currentHighestBidder && room.currentHighestBidder !== userId) {
          io.to(`user:${room.currentHighestBidder}`).emit("outbid", {
            auctionId,
            auctionTitle: `Auction ${auctionId}`, // You would fetch this from DB in reality
            yourBid: room.currentHighestBid,
            newHighestBid: bidAmount,
            timeRemaining: "2m 30s", // You would calculate this
            newBidder: userId,
          });
        }

        // Update room state
        room.currentHighestBid = bidAmount;
        room.currentHighestBidder = userId;

      } catch (error) {
        console.error("Error processing bid:", error);
        socket.emit("bidError", { message: "Failed to process bid" });
      }
    });

    // Handle auction ending
    socket.on("auctionEnding", ({ auctionId, timeRemaining, currentHighestBidder }) => {
      const room = auctionRooms.get(auctionId);
      if (!room) return;

      // Notify all bidders
      room.bidders.forEach(bidderId => {
        io.to(`user:${bidderId}`).emit("auctionEnding", {
          auctionId,
          auctionTitle: `Auction ${auctionId}`,
          timeRemaining,
          isLeading: bidderId === currentHighestBidder,
          currentHighestBid: room.currentHighestBid,
        });
      });
    });

    // Handle auction won
    socket.on("auctionWon", ({ auctionId, winnerId, winningBid }) => {
      io.to(`user:${winnerId}`).emit("auctionWon", {
        auctionId,
        auctionTitle: `Auction ${auctionId}`,
        winningBid,
        timestamp: new Date(),
      });
    });

    // Leave an auction room
    socket.on("leaveAuctionRoom", (auctionId) => {
      if (!auctionId) return;

      const room = auctionRooms.get(auctionId);
      if (!room) return;

      // Remove from user's rooms
      if (socket.user?.id) {
        userRooms.get(socket.user.id)?.delete(auctionId);
        room.bidders.delete(socket.user.id);
      } else {
        room.viewers = Math.max(0, room.viewers - 1);
      }

      socket.leave(auctionId);
      console.log(`User ${userId} left auction ${auctionId}`);

      // Clean up empty rooms
      if (room.bidders.size === 0 && room.viewers === 0) {
        auctionRooms.delete(auctionId);
      } else {
        // Update viewer count
        io.to(auctionId).emit("viewerCount", {
          auctionId,
          count: room.bidders.size + room.viewers
        });
      }
    });

    // Clean up on disconnect
    socket.on("disconnect", () => {
      console.log(`User disconnected: ${socket.id} (${userId})`);

      // Leave all rooms and clean up
      if (socket.user?.id) {
        const userRoomSet = userRooms.get(socket.user.id);
        if (userRoomSet) {
          userRoomSet.forEach(auctionId => {
            const room = auctionRooms.get(auctionId);
            if (room) {
              room.bidders.delete(socket.user.id);

              // Clean up empty rooms
              if (room.bidders.size === 0 && room.viewers === 0) {
                auctionRooms.delete(auctionId);
              } else {
                // Update viewer count
                io.to(auctionId).emit("viewerCount", {
                  auctionId,
                  count: room.bidders.size + room.viewers
                });
              }
            }
          });
          userRooms.delete(socket.user.id);
        }
      }
    });
  });

  // Helper function to get the io instance
  //const io = () => io;

  // Store io on the Express app
  app.set("io", io);
  return io;
};

module.exports = initSocket;




// Add these new event handlers inside the io.on('connection') block, after the existing event handlers

// Handle auction ending (admin-triggered)
socket.on('auctionEnding', async ({ auctionId, timeRemaining }) => {
  try {
    if (!auctionId) {
      throw new Error('Auction ID is required');
    }

    // Verify the auction exists and get its details
    const auction = await prisma.auction.findUnique({
      where: { id: auctionId, isDeleted: false },
      include: {
        seller: {
          select: {
            id: true,
            email: true,
            username: true
          }
        },
        currentBid: {
          select: {
            amount: true,
            bidder: {
              select: {
                id: true,
                email: true,
                username: true
              }
            }
          }
        }
      }
    });

    if (!auction) {
      throw new Error('Auction not found');
    }

    // Only allow admin or the seller to trigger auction ending
    if (socket.user?.role !== 'admin' && socket.user?.id !== auction.sellerId) {
      throw new Error('Unauthorized to end this auction');
    }

    logger.info(`Auction ${auctionId} is ending soon`, {
      timeRemaining,
      triggeredBy: socket.user?.id
    });

    // Notify all participants in the auction room
    io.to(auctionId).emit('auctionEnding', {
      auctionId,
      title: auction.title,
      timeRemaining,
      endsAt: auction.endTime,
      currentBid: auction.currentBid?.amount || auction.startingPrice,
      currentBidder: auction.currentBid?.bidder || null
    });

    // Notify the current highest bidder in their private room
    if (auction.currentBid?.bidder?.id) {
      io.to(`user:${auction.currentBid.bidder.id}`).emit('auctionEndingForYou', {
        auctionId,
        title: auction.title,
        timeRemaining,
        currentBid: auction.currentBid.amount,
        isLeading: true
      });
    }

  } catch (error) {
    logger.error('Error handling auction ending', {
      error: error.message,
      auctionId,
      userId: socket.user?.id
    });
    
    // Only send error back to the sender
    socket.emit('auctionError', {
      auctionId,
      message: error.message || 'Failed to process auction ending'
    });
  }
});

// Handle auction won (triggered when auction actually ends)
socket.on('auctionWon', async ({ auctionId }) => {
  try {
    if (!auctionId) {
      throw new Error('Auction ID is required');
    }

    // Get the final auction state
    const auction = await prisma.auction.findUnique({
      where: { id: auctionId },
      include: {
        seller: {
          select: {
            id: true,
            email: true,
            username: true
          }
        },
        currentBid: {
          select: {
            id: true,
            amount: true,
            bidder: {
              select: {
                id: true,
                email: true,
                username: true
              }
            }
          }
        }
      }
    });

    if (!auction) {
      throw new Error('Auction not found');
    }

    // Only allow admin or the seller to trigger this
    if (socket.user?.role !== 'admin' && socket.user?.id !== auction.sellerId) {
      throw new Error('Unauthorized to finalize this auction');
    }

    // Update auction status in the database
    await prisma.auction.update({
      where: { id: auctionId },
      data: { status: 'COMPLETED' }
    });

    logger.info(`Auction ${auctionId} won by ${auction.currentBid?.bidder?.id || 'no one'}`);

    // Notify all participants in the auction room
    const winnerData = auction.currentBid ? {
      winnerId: auction.currentBid.bidder.id,
      winnerUsername: auction.currentBid.bidder.username,
      winningBid: auction.currentBid.amount
    } : null;

    io.to(auctionId).emit('auctionWon', {
      auctionId,
      title: auction.title,
      ...winnerData,
      endedAt: new Date().toISOString()
    });

    // Notify the winner in their private room
    if (auction.currentBid?.bidder?.id) {
      io.to(`user:${auction.currentBid.bidder.id}`).emit('youWonAuction', {
        auctionId,
        title: auction.title,
        winningBid: auction.currentBid.amount,
        seller: {
          id: auction.seller.id,
          username: auction.seller.username
        }
      });
    }

    // Notify the seller in their private room
    if (auction.sellerId) {
      io.to(`user:${auction.sellerId}`).emit('yourAuctionEnded', {
        auctionId,
        title: auction.title,
        sold: !!auction.currentBid,
        winningBid: auction.currentBid?.amount,
        winner: auction.currentBid?.bidder
      });
    }

    // Clean up the room after a delay
    setTimeout(() => {
      if (auctionRooms.has(auctionId)) {
        auctionRooms.delete(auctionId);
      }
    }, 300000); // 5 minutes

  } catch (error) {
    logger.error('Error handling auction won', {
      error: error.message,
      auctionId,
      userId: socket.user?.id
    });
    
    // Only send error back to the sender
    socket.emit('auctionError', {
      auctionId,
      message: error.message || 'Failed to process auction win'
    });
  }
});



// In socketMiddleware.js, update the authenticateSocket middleware
const authenticateSocket = async (socket, next) => {
  try {
    // Get token from handshake or query params
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.query?.token ||
      (socket.handshake.headers.authorization || '').split(' ')[1];

    logger.info('Socket handshake token:', { 
      token: token ? 'Token received' : 'No token', 
      socketId: socket.id 
    });

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
      logger.info('JWT decoded:', { 
        userId: decoded.userId, // Log the userId from the token
        socketId: socket.id 
      });
    } catch (err) {
      logger.warn('Invalid token - treating socket as Guest', {
        socketId: socket.id,
        error: err.message,
      });
      socket.user = null;
      return next();
    }

    // Ensure userId is available in the token
    if (!decoded.userId) {
      logger.warn('No userId found in JWT token', {
        socketId: socket.id,
        decoded,
      });
      socket.user = null;
      return next();
    }

    // Get user from database using the correct field (userId)
    const user = await getUserById(decoded.userId);
    logger.info('User lookup result:', { 
      userId: decoded.userId, 
      userFound: !!user, 
      socketId: socket.id 
    });

    if (!user || user.isDeleted) {
      logger.warn('User not found or deactivated - treating socket as Guest', {
        socketId: socket.id,
        userId: decoded.userId,
      });
      socket.user = null;
      return next();
    }

    // Attach user to socket
    socket.user = {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      isVerified: user.isVerified,
    };

    logger.info('User authenticated successfully', {
      socketId: socket.id,
      userId: user.id,
      email: user.email,
    });

    next();
  } catch (error) {
    logger.error('Socket authentication error', {
      error: error.message,
      stack: error.stack,
      socketId: socket.id,
    });
    socket.user = null;
    next();
  }
};