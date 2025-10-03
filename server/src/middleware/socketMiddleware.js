import express from 'express';
import { Server as SocketIO } from 'socket.io';
import logger from '../utils/logger.js';
import { env } from '../config/env.js';

// This middleware makes the socket.io instance available in route handlers
export const socketMiddleware = (req, res, next) => {
  // The app.set('io', io) makes the io instance available here
  req.io = req.app.get('io');
  next();
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

  // Socket.IO middleware for authentication/authorization
  const wrap = middleware => (socket, next) => middleware(socket.request, {}, next);

  // Apply middleware
  io.use(wrap(express.json()));
  io.use(wrap(express.urlencoded({ extended: true })));
  
  // Add any additional middleware here (e.g., authentication)
  // io.use((socket, next) => { /* auth logic */ next(); });

  // Connection handler
  io.on('connection', (socket) => {
    logger.info('New client connected', { socketId: socket.id });

    // Join auction room
    socket.on('joinAuction', (auctionId) => {
      if (auctionId) {
        socket.join(auctionId);
        logger.info(`Client ${socket.id} joined auction room: ${auctionId}`);
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
