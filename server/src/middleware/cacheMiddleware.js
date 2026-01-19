import cacheService from '../services/cacheService.js';
import logger from '../utils/logger.js';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

/**
 * Cache middleware for GET responses with Redis.
 * Features:
 * - Per-user or global caching
 * - Safe deep cloning
 * - Response size limit (1 MB default)
 * - Vary header for correct CDN behavior
 * - Bypass via header/query param
 * - Optional skip for authenticated requests
 *
 * @param {Object} [options]
 * @param {number} [options.ttlSeconds=60]
 * @param {boolean} [options.skipWhenAuth=false]
 * @param {boolean} [options.includeUserInCacheKey=true]
 * @param {string[]} [options.excludePaths=[]]
 */

function extractUserIdFromToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, env.jwtSecret);
    return decoded.userId;
  } catch (error) {
    return null;
  }
}

export default function cacheMiddleware(options = {}) {
  const {
    ttlSeconds = 60,
    skipWhenAuth = false,
    includeUserInCacheKey = true,
    excludePaths = [],
  } = options;

  return async (req, res, next) => {
    try {
      // Skip non-GET requests
      if (req.method !== 'GET') return next();

      // Skip excluded paths
      if (excludePaths.some(path => req.path.startsWith(path))) {
        return next();
      }

      // Tells downstream caches (CDNs/Browsers) that response content
      // depends on the Auth and compression status.
      res.setHeader('Vary', 'Authorization, Accept-Encoding');

      // allow clients to opt-out with Cache-Control: no-cache or ?no_cache=1
      const noCacheHeader = (req.headers['cache-control'] || '').includes('no-cache');
      const noCacheQuery = req.query?.no_cache === '1' || req.query?.no_cache === 'true';

      if (noCacheHeader || noCacheQuery) {
        res.setHeader('X-Cache', 'BYPASS');
        return next();
      }

      // Determine if request is authenticated (use populated user when available)
      const hasAuthHeader = !!req.headers.authorization;

      // Handle authenticated requests based on options
      if (skipWhenAuth && hasAuthHeader) {
        res.setHeader('X-Cache', 'SKIP-AUTH');
        return next();
      }

      // Extract user ID from JWT token if present
      let userId = null;
      if (hasAuthHeader) {
        userId = extractUserIdFromToken(req.headers.authorization);
      }

      // Use extracted user ID or fall back to req.user
      const effectiveUserId = userId || req.user?.id;

      // Determine cache key strategy before auth populates user.
      const includeUser = includeUserInCacheKey && !!effectiveUserId;

      // Use request-aware cache service to get consistent keys
      let cached = null;
      let usedCacheType = 'NONE';

      // Try per-user cache first (most specific)
      if (includeUser) {
        cached = await cacheService.cacheGetPerUser(req);
        if (cached) usedCacheType = 'PER-USER';
      }

      // Fallback to global cache if no per-user hit or user unknown
      if (!cached) {
        cached = await cacheService.get(req);
        if (cached) usedCacheType = 'GLOBAL';
      }

      if (cached) {
        // set a header indicating served from cache
        res.setHeader('X-Cache', 'HIT');
        res.setHeader('X-Cache-Type', usedCacheType);
        res.setHeader('X-Cache-Key', cached._meta?.key || 'unknown');

        // Add cache metadata to response
        const responseBody = {
          ...cached.body,
          _meta: {
            ...cached.body._meta,
            cached: true,
            cachedAt: cached._meta?.cachedAt || new Date().toISOString(),
            expiresAt:
              cached._meta?.expiresAt ||
              new Date(Date.now() + (cached._meta?.ttl || ttlSeconds) * 1000).toISOString(),
          },
        };

        return res.status(cached.status || 200).json(responseBody);
      }

      // No cached response — mark as MISS immediately so clients always see cache status
      res.setHeader('X-Cache', 'MISS');

      // Store original response methods
      const originalJson = res.json.bind(res);
      const originalSend = res.send.bind(res);
      const originalEnd = res.end.bind(res);

      // Response data collector
      let responseBody = null;
      let responseStatusCode = 200;

      // Override json method to capture response
      res.json = function (body) {
        responseBody = body;
        responseStatusCode = this.statusCode;
        return originalJson(body);
      };

      // Override send method for non-JSON responses
      res.send = function (body) {
        responseBody = body;
        responseStatusCode = this.statusCode;
        return originalSend(body);
      };

      // Override end method to ensure we capture all responses
      res.end = function (...args) {
        // If we haven't captured body via json/send, try to capture
        if (responseBody === null && args.length > 0 && typeof args[0] !== 'function') {
          responseBody = args[0];
          responseStatusCode = this.statusCode;
        }
        return originalEnd(...args);
      };

      // After response is sent, cache it if appropriate
      res.on('finish', async () => {
        try {
          // Only cache successful responses (2xx)
          if (responseStatusCode < 200 || responseStatusCode >= 300) {
            logger.debug('Skipping cache for non-2xx response', {
              status: responseStatusCode,
              path: req.path,
            });
            return;
          }

          // Only cache if we have a response body
          if (responseBody === null || responseBody === undefined) {
            return;
          }

          // DEEP CLONE: Ensures stored data is a static snapshot
          let finalBody = responseBody;
          if (typeof responseBody === 'object') {
            finalBody = JSON.parse(JSON.stringify(responseBody));
          }

          // Skip if response body is too large (optional)
          // Safety: Check size (Don't cache payloads > 1MB)
          const responseSize = JSON.stringify(finalBody).length;
          if (responseSize > 1024 * 1024) {
            logger.warn('Response too large to cache', {
              size: responseSize,
              path: req.path,
            });
            return;
          }

          // Determine TTL (allow override via res.locals)
          const ttl = typeof res.locals.cacheTtl === 'number' ? res.locals.cacheTtl : ttlSeconds;

          // Prepare cache payload
          // Re-evaluate whether to store as per-user at the time of caching
          const storeAsPerUser = includeUserInCacheKey && !!effectiveUserId;

          const cachePayload = {
            status: responseStatusCode,
            body: finalBody,
            _meta: {
              ttl,
              cachedAt: new Date().toISOString(),
              expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
              size: responseSize,
              path: req.path,
              key: storeAsPerUser
                ? cacheService.getCacheKey(req, true)
                : cacheService.getCacheKey(req),
            },
          };

          // Cache the response
          if (storeAsPerUser) {
            const reqWithUser = { 
              ...req, 
              query: req.query,  // Explicitly copy query property
              user: { id: effectiveUserId, ...req.user } 
            };
            await cacheService.cacheSetPerUser(reqWithUser, cachePayload, ttl);
          } else {
            await cacheService.set(req, cachePayload, ttl);
          }

          // Write secondary global key if we looked up as global but stored as per-user
          if (!includeUser && storeAsPerUser) {
            logger.debug('Writing secondary global cache key', { path: req.path });
            const reqNoUser = { ...req, user: undefined };
            await cacheService.set(reqNoUser, cachePayload, ttl);
          }

          logger.debug('Cached response', {
            path: req.path,
            status: responseStatusCode,
            ttl,
            size: responseSize,
            userSpecific: includeUser,
          });
        } catch (cacheError) {
          logger.warn('Failed to cache response', {
            error: cacheError.message,
            path: req.path,
            status: responseStatusCode,
          });
          // Don't throw - caching failure shouldn't affect response
        }
      });

      next();
    } catch (err) {
      logger.warn('Cache middleware error', { error: err?.message, path: req.path });
      // Continue without caching
      res.setHeader('X-Cache', 'ERROR');
      next();
    }
  };
}
