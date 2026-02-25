import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { getRedisClient } from '../config/redisAdapter.js';
import logger from '../utils/logger.js';
import { AppError } from '../middleware/errorHandler.js';

// Generate access token
const generateAccessToken = (userId, email, role) => {
  return jwt.sign({ userId, email, role, type: 'access' }, env.jwtSecret, {
    expiresIn: env.accessTokenExpiry,
  });
};

// Generate refresh token with rotation
const generateRefreshToken = async (userId, email, role) => {
  const refreshToken = jwt.sign({ userId, email, role, type: 'refresh' }, env.jwtSecret, {
    expiresIn: env.refreshTokenExpiry,
  });

  // Parse the refresh token expiration time
  const decoded = jwt.verify(refreshToken, env.jwtSecret);
  const expiresIn = Math.floor(decoded.exp - Math.floor(Date.now() / 1000));

  // Store the refresh token in Redis with the same expiration
  try {
    const redis = await getRedisClient();
    if (redis) {
      await redis.setEx(`refresh_token:${userId}:${refreshToken}`, expiresIn, 'valid');
    } else {
      throw new AppError('REDIS_CLIENT_NOT_AVAILABLE', 'Redis client not available', 500);
    }
  } catch (error) {
    logger.error('Failed to store refresh token in Redis:', { userId, error: error.message });
    throw new AppError('REDIS_CLIENT_NOT_AVAILABLE', 'Failed to generate refresh token', 500);
  }

  return refreshToken;
};

const verifyToken = token => {
  try {
    return jwt.verify(token, env.jwtSecret);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new AppError('TOKEN_EXPIRED', 'Your session has expired. Please log in again.', 401);
    }
    if (error.name === 'JsonWebTokenError') {
      throw new AppError('INVALID_TOKEN', 'Invalid token. Please log in again.', 401);
    }
    // Fallback for any other error
    throw new AppError('INVALID_TOKEN', 'Token verification failed', 401);
  }
};

// Revoke a refresh token
const revokeRefreshToken = async (userId, token) => {
  try {
    const redis = await getRedisClient();
    if (redis) {
      await redis.del(`refresh_token:${userId}:${token}`);
    }
    return true;
  } catch (error) {
    logger.error('Failed to revoke refresh token:', { userId, token, error: error.message });
    throw new AppError('REDIS_CLIENT_NOT_AVAILABLE', 'Failed to revoke refresh token', 500);
  }
};

// Helper: scan all matching keys without blocking Redis (avoids KEYS)
async function scanAllKeys(client, pattern, count = 200) {
  const keys = [];
  let cursor = '0';
  do {
    // adapter.scan returns { cursor, keys }
    const res = await client.scan(cursor, { MATCH: pattern, COUNT: count });
    cursor = res.cursor;
    keys.push(...res.keys);
  } while (cursor !== '0');
  return keys;
}

// Revoke all refresh tokens for a user (on logout all devices)
const revokeAllRefreshTokens = async userId => {
  try {
    const redis = await getRedisClient();
    if (!redis) {
      logger.error('Redis client not available, cannot revoke tokens.');
      return false;
    }

    // Use SCAN to avoid blocking Redis on large datasets
    const pattern = `refresh_token:${userId}:*`;
    const keys = await scanAllKeys(redis, pattern, 500);
    if (keys.length > 0) {
      logger.info(`Found ${keys.length} tokens to revoke for user ${userId}. Deleting in batches.`);
      // Delete in batches to avoid large argument lists
      const batchSize = 500;
      for (let i = 0; i < keys.length; i += batchSize) {
        const slice = keys.slice(i, i + batchSize);
        await redis.del(slice);
      }
    } else {
      logger.info(`No refresh tokens found to revoke for user ${userId}.`);
    }
    return true;
  } catch (error) {
    logger.error('Failed to revoke all refresh tokens:', { userId, error: error.message });
    throw new AppError('REDIS_CLIENT_NOT_AVAILABLE', 'Failed to revoke all refresh tokens', 500);
  }
};

// Check if a refresh token is valid
const isRefreshTokenValid = async (userId, token) => {
  try {
    const redis = await getRedisClient();
    if (!redis) {
      logger.error('Redis client not available, cannot revoke tokens.');
      return false;
    }

    const key = `refresh_token:${userId}:${token}`;
    const result = await redis.get(key);
    const isValid = result === 'valid';

    if (!isValid) {
      logger.warn(`Invalid or expired refresh token for user ${userId}`, {
        tokenExists: result !== null,
        key,
      });
    }

    return isValid;
  } catch (error) {
    logger.error('Failed to check refresh token validity:', {
      userId,
      token,
      error: error.message,
    });
    throw new AppError('REDIS_CLIENT_NOT_AVAILABLE', 'Failed to check refresh token validity', 500);
  }
};

export {
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
  revokeRefreshToken,
  revokeAllRefreshTokens,
  isRefreshTokenValid,
};
