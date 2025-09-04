import { createClient } from 'redis';
import { env } from './env.js';
import logger from '../utils/logger.js';

let redisClient = null;

export async function getRedisClient() {
  if (redisClient && redisClient.isOpen) {
    return redisClient;
  }

  try {
    // Create Redis client with configuration
    redisClient = createClient({
      socket: {
        host: env.redis?.host || '127.0.0.1',
        port: env.redis?.port || 6379,
        tls: env.redis?.tls || false,
        reconnectStrategy: (retries) => {
          // Exponential backoff with max delay
          return Math.min(retries * 100, 3000);
        }
      },
      password: env.redis?.password || undefined,
      // Add prefix to all keys
      legacyMode: false // Use new Redis commands
    });

    // Event handlers
    redisClient.on('connect', () => {
      logger.info('Redis client connecting', {
        host: env.redis?.host,
        port: env.redis?.port
      });
    });

    redisClient.on('ready', () => {
      logger.info('Redis client ready', {
        host: env.redis?.host,
        port: env.redis?.port,
        auth: Boolean(env.redis?.password) ? 'enabled' : 'disabled',
        tls: Boolean(env.redis?.tls) ? 'enabled' : 'disabled',
      });
    });

    redisClient.on('error', (err) => {
      logger.error('Redis client error', { error: err.message });
    });

    redisClient.on('end', () => {
      logger.info('Redis client connection ended');
    });

    redisClient.on('reconnecting', () => {
      logger.info('Redis client reconnecting');
    });

    // Connect to Redis
    await redisClient.connect();
    
    return redisClient;

  } catch (error) {
    logger.error('Failed to create Redis client', { error: error.message });
    throw error;
  }
}

// Helper function to safely execute Redis commands
export async function executeRedisCommand(command, ...args) {
  try {
    const client = await getRedisClient();
    return await client[command](...args);
  } catch (error) {
    logger.error(`Redis command ${command} failed`, { 
      error: error.message,
      args 
    });
    throw error;
  }
}

// Gracefully close Redis connection
export async function closeRedisClient() {
  if (redisClient && redisClient.isOpen) {
    await redisClient.quit();
    logger.info('Redis client connection closed');
  }
}

// Health check function
export async function checkRedisHealth() {
  try {
    const client = await getRedisClient();
    await client.ping();
    return true;
  } catch (error) {
    logger.error('Redis health check failed', { error: error.message });
    return false;
  }
}