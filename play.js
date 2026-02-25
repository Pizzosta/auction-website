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
export default function cacheMiddleware(options = {}) {
  const {
    ttlSeconds = 60,
    skipWhenAuth = false,
    includeUserInCacheKey = true,
    excludePaths = [],
  } = options;

  return async (req, res, next) => {
    if (req.method !== 'GET') return next();

    if (excludePaths.some((p) => req.path.startsWith(p))) return next();

    res.setHeader('Vary', 'Authorization, Accept-Encoding');

    // Explicit bypass
    const noCache =
      (req.headers['cache-control'] || '').includes('no-cache') ||
      req.query?.no_cache === '1' ||
      req.query?.no_cache === 'true';

    if (noCache) {
      res.setHeader('X-Cache', 'BYPASS');
      return next();
    }

    const isAuthenticated = !!req.headers.authorization;
    if (skipWhenAuth && isAuthenticated) {
      res.setHeader('X-Cache', 'SKIP-AUTH');
      return next();
    }

    const perUser = includeUserInCacheKey && isAuthenticated;

    // ── Cache lookup ───────────────────────────────────────
    let cached;
    try {
      cached = perUser
        ? await cacheService.cacheGetPerUser(req)
        : await cacheService.get(req);
    } catch (err) {
      logger.warn('Cache read failed', { path: req.path, error: err.message });
      // continue → treat as miss
    }

    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      if (cached._meta?.key) {
        res.setHeader('X-Cache-Key', cached._meta.key);
      }

      const bodyWithMeta = {
        ...cached.body,
        _meta: {
          ...(cached.body._meta || {}),
          cached: true,
          cachedAt: cached._meta?.cachedAt,
          expiresAt: cached._meta?.expiresAt,
        },
      };

      return res.status(cached.status || 200).json(bodyWithMeta);
    }

    // ── Cache miss ─────────────────────────────────────────
    res.setHeader('X-Cache', 'MISS');

    // ── Response interception ──────────────────────────────
    const original = {
      json: res.json.bind(res),
      send: res.send.bind(res),
      end: res.end.bind(res),
    };

    let capturedBody = null;
    let capturedStatus = 200;

    res.json = (body) => {
      capturedBody = body;
      capturedStatus = res.statusCode;
      return original.json(body);
    };

    res.send = (body) => {
      capturedBody = body;
      capturedStatus = res.statusCode;
      return original.send(body);
    };

    res.end = (...args) => {
      if (capturedBody == null && args.length > 0 && typeof args[0] !== 'function') {
        capturedBody = args[0];
        capturedStatus = res.statusCode;
      }
      return original.end(...args);
    };

    res.on('finish', async () => {
      if (capturedStatus < 200 || capturedStatus >= 300) return;
      if (capturedBody == null) return;

      let bodyToCache = capturedBody;
      if (typeof capturedBody === 'object' && capturedBody !== null) {
        bodyToCache = JSON.parse(JSON.stringify(capturedBody));
      }

      const bodyStr = JSON.stringify(bodyToCache);
      if (bodyStr.length > 1_000_000) {
        logger.warn('Response too large to cache', {
          path: req.path,
          size: bodyStr.length,
        });
        return;
      }

      const ttl = Number.isInteger(res.locals.cacheTtl)
        ? res.locals.cacheTtl
        : ttlSeconds;

      const payload = {
        status: capturedStatus,
        body: bodyToCache,
        _meta: {
          ttl,
          cachedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
          size: bodyStr.length,
          path: req.path,
          key: perUser
            ? cacheService.getCacheKey(req, true)
            : cacheService.getCacheKey(req),
        },
      };

      try {
        if (perUser) {
          await cacheService.cacheSetPerUser(req, payload, ttl);
        } else {
          await cacheService.set(req, payload, ttl);
        }
      } catch (err) {
        logger.warn('Cache write failed', { path: req.path, error: err.message });
      }
    });

    next();
  };
}







import cacheService from '../utils/cache.js'; // Updated import path
import logger from '../utils/logger.js';

/**
 * Cache middleware that intercepts GET responses and caches them
 * Options: 
 * - ttlSeconds: Default TTL for cache (default: 60)
 * - skipWhenAuth: Skip cache for authenticated requests (default: false)
 * - includeUserInCacheKey: Include user ID in cache key for auth requests (default: true)
 */
export default function cacheMiddleware(options = {}) {
  const { 
    ttlSeconds = 60, 
    skipWhenAuth = false,
    includeUserInCacheKey = true,
    excludePaths = []
  } = options;

  return async (req, res, next) => {
    try {
      // Skip non-GET requests
      if (req.method !== 'GET') {
        return next();
      }

      // Skip excluded paths
      if (excludePaths.some(path => req.path.startsWith(path))) {
        return next();
      }

      // Check if client wants to bypass cache
      const noCacheHeader = (req.headers['cache-control'] || '').includes('no-cache');
      const noCacheQuery = req.query?.no_cache === '1' || req.query?.no_cache === 'true';
      
      if (noCacheHeader || noCacheQuery) {
        res.setHeader('X-Cache', 'BYPASS');
        return next();
      }

      // Determine if request is authenticated
      const isAuthenticated = !!req.headers.authorization;
      
      // Handle authenticated requests based on options
      if (skipWhenAuth && isAuthenticated) {
        res.setHeader('X-Cache', 'SKIP-AUTH');
        return next();
      }

      // Determine cache key strategy
      const includeUser = includeUserInCacheKey && isAuthenticated;
      
      // Try to get from cache
      const cached = includeUser 
        ? await cacheService.cacheGetPerUser(req)
        : await cacheService.get(req);

      if (cached) {
        // Serve from cache
        res.setHeader('X-Cache', 'HIT');
        res.setHeader('X-Cache-Key', cached._meta?.key || 'unknown');
        
        // Add cache metadata to response
        const responseBody = {
          ...cached.body,
          _meta: {
            ...cached.body._meta,
            cached: true,
            cachedAt: cached._meta?.cachedAt || new Date().toISOString(),
            expiresAt: cached._meta?.expiresAt || new Date(Date.now() + (cached._meta?.ttl || ttlSeconds) * 1000).toISOString(),
          }
        };

        return res.status(cached.status || 200).json(responseBody);
      }

      // Cache miss - proceed with request
      res.setHeader('X-Cache', 'MISS');
      
      // Store original response methods
      const originalJson = res.json.bind(res);
      const originalSend = res.send.bind(res);
      const originalEnd = res.end.bind(res);

      // Response data collector
      let responseBody = null;
      let responseStatusCode = 200;

      // Override json method to capture response
      res.json = function(body) {
        responseBody = body;
        responseStatusCode = this.statusCode;
        return originalJson(body);
      };

      // Override send method for non-JSON responses
      res.send = function(body) {
        responseBody = body;
        responseStatusCode = this.statusCode;
        return originalSend(body);
      };

      // Override end method to ensure we capture all responses
      res.end = function(...args) {
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
              path: req.path 
            });
            return;
          }

          // Only cache if we have a response body
          if (responseBody === null || responseBody === undefined) {
            return;
          }

          // Skip if response body is too large (optional)
          const responseSize = JSON.stringify(responseBody).length;
          if (responseSize > 1024 * 1024) { // 1MB limit
            logger.warn('Response too large to cache', { 
              size: responseSize,
              path: req.path 
            });
            return;
          }

          // Determine TTL (allow override via res.locals)
          const ttl = typeof res.locals.cacheTtl === 'number' 
            ? res.locals.cacheTtl 
            : ttlSeconds;

          // Prepare cache payload
          const cachePayload = {
            status: responseStatusCode,
            body: responseBody,
            _meta: {
              ttl,
              cachedAt: new Date().toISOString(),
              expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
              size: responseSize,
              path: req.path,
              key: includeUser 
                ? cacheService.getCacheKey(req, true)
                : cacheService.getCacheKey(req),
            }
          };

          // Cache the response
          if (includeUser) {
            await cacheService.cacheSetPerUser(req, cachePayload, ttl);
          } else {
            await cacheService.set(req, cachePayload, ttl);
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
      logger.warn('Cache middleware error', { 
        error: err?.message,
        path: req.path 
      });
      // Continue without caching
      res.setHeader('X-Cache', 'ERROR');
      next();
    }
  };
}