import crypto from 'crypto';
import { getRedisClient } from '../config/redis.js';
import { AppError } from '../middleware/errorHandler.js';

// Acquire a distributed lock using Redis SET NX PX
// Returns { token, release: () => Promise<void> }
export async function acquireLock(key, ttlMs = 5000, options = {}) {
  const { retries = 10, retryDelay = 50, jitter = 25 } = options;
  const client = await getRedisClient();
  const token = crypto.randomBytes(16).toString('hex');
  const start = Date.now();
  let attempts = 0;
  while (attempts <= retries) {
    // Redis v5 client supports options object for NX/PX
    const result = await client.set(key, token, { NX: true, PX: ttlMs });
    if (result === 'OK') {
      return {
        token,
        waitMs: Date.now() - start,
        async release() {
          await releaseLock(key, token);
        },
      };
    }
    attempts += 1;
    // Simple backoff with jitter
    const delay = retryDelay + Math.floor(Math.random() * jitter);
    await new Promise(r => setTimeout(r, delay));
  }

  throw new AppError(
    'LOCK_TIMEOUT',
    `Unable to acquire lock for auction after ${retries} attempts. This auction is experiencing high bid activity.`,
    429, // Too Many Requests
    {
      key,
      ttlMs,
      retries,
      waitTimeMs: Date.now() - start
    }
  );
}

// Release lock using a Lua script to ensure we only delete if token matches
export async function releaseLock(key, token) {
  const client = await getRedisClient();
  const lua = `
    if redis.call('get', KEYS[1]) == ARGV[1] then
      return redis.call('del', KEYS[1])
    else
      return 0
    end
  `;
  try {
    await client.eval(lua, { keys: [key], arguments: [token] });
  } catch (e) {
    // Swallow release errors; lock will expire by TTL
  }
}
