/*import { env } from './env.js';
import logger from '../utils/logger.js';

// Centralized Redis options used by Bull queues and health checks
export const redisOptions = {
  host: env.redis?.host || '127.0.0.1',
  port: env.redis?.port || 6379,
  ...(env.redis?.password ? { password: env.redis.password } : {}),
  ...(env.redis?.tls ? { tls: env.redis.tls } : {}),
};

// Log the effective Redis configuration (no secrets)
try {
  logger.info('Redis configuration loaded', {
    host: redisOptions.host,
    port: redisOptions.port,
    auth: Boolean(env.redis?.password) ? 'enabled' : 'disabled',
    tls: Boolean(env.redis?.tls) ? 'enabled' : 'disabled',
  });
} catch {}

export default {
  redisOptions,
};

// Lazy-initialized singleton Redis client (Node-Redis v4)
let clientPromise = null;

export async function getRedisClient() {
  if (clientPromise) return clientPromise;

  clientPromise = (async () => {
    try {
      const redisMod = await import('redis');
      const { createClient } = redisMod;
      const socket = { host: redisOptions.host, port: redisOptions.port };
      if (redisOptions.tls) socket.tls = redisOptions.tls;
      const client = createClient({
        socket,
        password: redisOptions.password,
      });

      client.on('error', (err) => logger.error('Redis client error:', err));
      if (!client.isOpen) {
        await client.connect();
      }
      logger.info('Redis client connected', { host: socket.host, port: socket.port });
      return client;
    } catch (e) {
      logger.warn('Redis client not available; falling back to memory where applicable', { message: e?.message });
      return null;
    }
  })();

  return clientPromise;
}
*/

// redis.js
//import Redis from 'ioredis';
//import Redis from 'redis';
/*
import { createClient } from 'redis';
import { env } from './env.js';
import logger from '../utils/logger.js';

let redisClient;

export async function getRedisClient() {
  if (!redisClient) {
    redisClient = new createClient({
      host: env.redis?.host || '127.0.0.1',
      port: env.redis?.port || 6379,
      password: env.redis?.password || undefined,
      tls: env.redis?.tls || undefined,
      retryStrategy: (times) => Math.min(times * 100, 5000),
      enableOfflineQueue: true,
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      showFriendlyErrorStack: process.env.NODE_ENV !== 'production',
      keyPrefix: 'auction:',
    });

    redisClient.on('connect', () => {
      logger.info('Redis client connected', {
        host: env.redis?.host,
        port: env.redis?.port,
        auth: Boolean(env.redis?.password) ? 'enabled' : 'disabled',
        tls: Boolean(env.redis?.tls) ? 'enabled' : 'disabled',
      });
    });

    redisClient.on('error', (err) => {
      logger.error('redis error', { error: err.message });
    });
  }

  return redisClient;
}
*/

// redis.js
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