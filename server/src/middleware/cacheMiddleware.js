import cacheService from '../services/cacheService.js';
import logger from '../utils/logger.js';

// Middleware to cache GET responses in Redis
// Options: ttlSeconds (default 60), skipWhenAuth (skip caching when Authorization header present)
export default function cacheMiddleware(options = {}) {
  const { ttlSeconds = 60, skipWhenAuth = true } = options;

  return async (req, res, next) => {
    try {
      if (req.method !== 'GET') return next();

      if (skipWhenAuth && req.headers.authorization) return next();

      // allow clients to opt-out with Cache-Control: no-cache or ?no_cache=1
      const noCacheHeader = (req.headers['cache-control'] || '').includes('no-cache');
      if (noCacheHeader || req.query?.no_cache === '1' || req.query?.no_cache === 'true')
        return next();

      // Use request-aware cache service to get consistent keys
      const cached = await cacheService.get(req);
      if (cached) {
        // set a header indicating served from cache
        res.setHeader('X-Cache', 'HIT');
        // Allow handlers to set TTL in locals
        res.locals.cacheTtl = typeof cached._meta?.ttl === 'number' ? cached._meta.ttl : ttlSeconds;
        return res.status(cached.status || 200).json(cached.body);
      }

      // Capture json responses
      const originalJson = res.json.bind(res);
      res.json = async body => {
        try {
          const payload = { status: res.statusCode || 200, body };
          // store meta to allow cacheHeaders middleware to set header
          payload._meta = {
            ttl: typeof res.locals.cacheTtl === 'number' ? res.locals.cacheTtl : ttlSeconds,
          };
          await cacheService.set(req, payload, payload._meta.ttl || ttlSeconds);
          res.setHeader('X-Cache', 'MISS');
        } catch (err) {
          logger.warn('Failed to write cache', { error: err?.message, url: req.originalUrl });
        }
        return originalJson(body);
      };

      next();
    } catch (err) {
      logger.warn('Cache middleware error', { error: err?.message });
      return next();
    }
  };
}
