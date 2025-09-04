import { env } from './env.js';
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
