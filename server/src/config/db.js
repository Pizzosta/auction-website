import mongoose from 'mongoose';
import logger from '../utils/logger.js';

// Exit application on error
mongoose.connection.on('error', err => {
  logger.error(`MongoDB connection error: ${err}`);
  process.exit(1);
});

// Log when the database is connected
mongoose.connection.on('connected', () => {
  logger.info('MongoDB connected successfully');
});

// Log when the database is disconnected
mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB disconnected');
});

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
      socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
    });

    // Log successful connection
    logger.info(`MongoDB connected to: ${mongoose.connection.host}`);

    return mongoose.connection;
  } catch (error) {
    logger.error(`MongoDB connection error: ${error.message}`);

    // Exit process with failure
    process.exit(1);
  }
};

// Handle process termination
process.on('SIGINT', async () => {
  try {
    await mongoose.connection.close();
    logger.info('MongoDB connection closed through app termination');
    process.exit(0);
  } catch (error) {
    logger.error('Error closing MongoDB connection:', error);
    process.exit(1);
  }
});

export default connectDB;
