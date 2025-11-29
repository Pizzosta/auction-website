import IORedis from 'ioredis';
import { env } from './env.js';
import logger from '../utils/logger.js';

let redisClient = null;

export async function getRedisClient() {
  if (redisClient && redisClient.status === 'ready') {
    return redisClient;
  }

  try {
    // Create ioredis client with configuration
    redisClient = new IORedis({
      host: env.redis?.host || '127.0.0.1',
      port: env.redis?.port || 6379,
      password: env.redis?.password || undefined,
      tls: env.redis?.tls ? {} : undefined,
      maxRetriesPerRequest: 3,
      connectTimeout: 10000,              // 10 second connection timeout
      commandTimeout: 5000,               // 5 second command timeout
      retryDelayOnFailover: 100,
      retryStrategy: (times) => {
        if (times > 10) {
          return null; // Stop retrying after 10 attempts
        }
        // Exponential backoff with max delay
        return Math.min(times * 100, 3000);
      },
      reconnectOnError: (err) => {
        const targetError = 'READONLY';
        if (err.message.includes(targetError)) {
          // Only reconnect when the error contains "READONLY"
          return true;
        }
        return false;
      },
      lazyConnect: true, // Connect lazily for better control
    });

    // Event handlers
    redisClient.on('connect', () => {
      logger.info('ioredis client connecting', {
        host: env.redis?.host,
        port: env.redis?.port,
      });
    });

    redisClient.on('ready', () => {
      logger.info('ioredis client ready', {
        host: env.redis?.host,
        port: env.redis?.port,
        auth: env.redis?.password ? 'enabled' : 'disabled',
        tls: env.redis?.tls ? 'enabled' : 'disabled',
      });
    });

    redisClient.on('error', err => {
      logger.error('ioredis client error', { error: err.message });
    });

    redisClient.on('end', () => {
      logger.info('ioredis client connection ended');
    });

    redisClient.on('reconnecting', () => {
      logger.info('ioredis client reconnecting');
    });

    // Connect to Redis
    await redisClient.connect();

    return redisClient;
  } catch (error) {
    logger.error('Failed to create ioredis client', { error: error.message });
    redisClient = null;
    throw error;
  }
}

// Helper function to safely execute Redis commands
export async function executeRedisCommand(command, ...args) {
  try {
    const client = await getRedisClient();
    return await client[command](...args);
  } catch (error) {
    logger.error(`ioredis command ${command} failed`, {
      error: error.message,
      args,
    });
    throw error;
  }
}

// Gracefully close Redis connection
export async function closeRedisClient() {
  if (redisClient && redisClient.status === 'ready') {
    await redisClient.quit();
    redisClient = null;
    logger.info('ioredis client connection closed');
  }
}

// Health check function
export async function checkRedisHealth() {
  try {
    const client = await getRedisClient();
    await client.ping();
    return true;
  } catch (error) {
    logger.error('ioredis health check failed', { error: error.message });
    return false;
  }
}