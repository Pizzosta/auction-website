import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { getRedisClient } from '../config/redis.js';
import logger from '../utils/logger.js';

// Generate access token
const generateAccessToken = (userId, email, role) => {
    return jwt.sign(
        { userId, email, role, type: 'access' },
        env.jwtSecret,
        { expiresIn: env.accessTokenExpiry }
    );
};

// Generate refresh token with rotation
const generateRefreshToken = async (userId, email, role) => {
    const refreshToken = jwt.sign(
        { userId, email, role, type: 'refresh' },
        env.jwtSecret,
        { expiresIn: env.refreshTokenExpiry }
    );

    // Parse the refresh token expiration time
    const decoded = jwt.verify(refreshToken, env.jwtSecret);
    const expiresIn = Math.floor((decoded.exp - Math.floor(Date.now() / 1000)));

    // Store the refresh token in Redis with the same expiration
    try {
        const redis = await getRedisClient();
        if (redis) {
            await redis.setEx(
                `refresh_token:${userId}:${refreshToken}`,
                expiresIn,
                'valid'
            );
        } else {
            throw new Error('Redis client not available');
        }
    } catch (error) {
        logger.error('Failed to store refresh token in Redis:', error);
        throw new Error('Failed to generate refresh token');
    }

    return refreshToken;
};

// Verify token and return payload if valid
const verifyToken = (token) => {
    try {
        return jwt.verify(token, env.jwtSecret);
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            throw new Error('Token expired');
        }
        throw new Error('Invalid token');
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
        logger.error('Failed to revoke refresh token:', error);
        return false;
    }
};

// Revoke all refresh tokens for a user (on logout all devices)
const revokeAllRefreshTokens = async (userId) => {
    try {
        const redis = await getRedisClient();
        if (redis) {
            // Find all refresh tokens for the user and delete them
            const keys = await redis.keys(`refresh_token:${userId}:*`);
            if (keys.length > 0) {
                await redis.del(keys);
            }
        }
        return true;
    } catch (error) {
        logger.error('Failed to revoke all refresh tokens:', error);
        return false;
    }
};

// Check if a refresh token is valid
const isRefreshTokenValid = async (userId, token) => {
    try {
        const redis = await getRedisClient();
        if (!redis) {
            logger.error('Redis client not available');
            return false;
        }

        const key = `refresh_token:${userId}:${token}`;
        const result = await redis.get(key);
        const isValid = result === 'valid';

        if (!isValid) {
            logger.warn(`Invalid or expired refresh token for user ${userId}`, {
                tokenExists: result !== null,
                key
            });
        }

        return isValid;
    } catch (error) {
        logger.error('Failed to check refresh token validity:', error);
        return false;
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
