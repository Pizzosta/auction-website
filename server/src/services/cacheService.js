import { getRedisClient } from '../config/redisAdapter.js';
import pLimit from 'p-limit';
import logger from '../utils/logger.js';

// Configuration
const CONFIG = {
  DEFAULT_TTL: 60, // 1 minute
  MAX_CONCURRENT_DELETES: 5,
  SCAN_BATCH_SIZE: 100,
  DELETE_CHUNK_SIZE: 100,
  OPERATION_TIMEOUT_MS: 10000,
};

// Cache statistics
const cacheStats = {
  hits: 0,
  misses: 0,
  sets: 0,
  deletes: 0,
  errors: 0,
};

// Use route path as cache key directly
export function getCacheKey(req, includeUser = false) {
  // Include HTTP method to avoid collisions
  const method = req.method.toUpperCase();

  // Sort query params for consistent cache keys
  const normalizeValue = val => (Array.isArray(val) ? val.sort().join(',') : val);

  const sortedQuery = Object.keys(req.query)
    .sort()
    .reduce((acc, key) => {
      acc[key] = normalizeValue(req.query[key]);
      return acc;
    }, {});

  const queryStr = Object.keys(sortedQuery).length ? `:${JSON.stringify(sortedQuery)}` : '';

  // Build full path with fallbacks
  const routePath = `${req.baseUrl || ''}${req.path || req.route?.path || ''}`;

  // Include user ID for authenticated routes
  const userId = includeUser && req.user?.id ? `:user:${req.user.id}` : '';

  return `${method}:${routePath}${userId}${queryStr}`;
}

export async function cacheGet(req) {
  try {
    const key = getCacheKey(req);
    const redis = await getRedisClient();
    if (!redis || redis.status !== 'ready') {
      logger.warn('Redis not ready, skipping cache get');
      cacheStats.errors++;
      return null;
    }

    const data = await redis.get(key);
    if (!data) {
      logger.debug('Cache miss', { key });
      cacheStats.misses++;
      return null;
    }

    logger.debug('Cache hit', { key, size: data.length });
    cacheStats.hits++;

    // Parse with date revival
    return JSON.parse(data, (key, value) => {
      // Revive Date objects from ISO strings
      if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
        const date = new Date(value);
        return isNaN(date.getTime()) ? value : date;
      }
      return value;
    });
  } catch (err) {
    cacheStats.errors++;
    logger.warn('Cache get failed', {
      key: getCacheKey(req),
      error: err?.message,
      stack: err.stack,
    });
    return null;
  }
}

export async function cacheSet(req, value, ttl = CONFIG.DEFAULT_TTL) {
  try {
    const key = getCacheKey(req);
    const redis = await getRedisClient();
    if (!redis || redis.status !== 'ready') {
      logger.warn('Redis not ready, skipping cache set');
      cacheStats.errors++;
      return null;
    }

    // Safe stringify with circular reference handling
    const str = JSON.stringify(value, (key, val) => {
      // Handle circular references and special types
      if (typeof val === 'bigint') {
        return val.toString();
      }
      if (val instanceof Date) {
        return val.toISOString();
      }
      if (val === undefined) {
        return null;
      }
      return val;
    });

    // Use EX seconds
    await redis.set(key, str, 'EX', Math.max(1, ttl));
    logger.debug('Cache set', { key, size: str.length, ttl });
    cacheStats.sets++;
  } catch (err) {
    cacheStats.errors++;
    logger.warn('Cache set failed', {
      key: getCacheKey(req),
      error: err?.message,
      stack: err.stack,
    });
  }
}

export async function cacheDel(req) {
  try {
    const key = getCacheKey(req);
    const redis = await getRedisClient();
    if (!redis || redis.status !== 'ready') {
      logger.warn('Redis not ready, skipping cache del');
      cacheStats.errors++;
      return null;
    }

    const result = await redis.del(key);
    logger.debug('Cache deleted', { key, deleted: result > 0 });
    cacheStats.deletes += result;
  } catch (err) {
    cacheStats.errors++;
    logger.warn('Cache del failed', {
      key: getCacheKey(req),
      error: err?.message,
      stack: err.stack,
    });
  }
}

export async function cacheDelByPrefix(prefix, options = {}) {
  const {
    maxConcurrent = CONFIG.MAX_CONCURRENT_DELETES,
    scanBatchSize = CONFIG.SCAN_BATCH_SIZE,
    deleteChunkSize = CONFIG.DELETE_CHUNK_SIZE,
    dryRun = false,
    timeoutMs = CONFIG.OPERATION_TIMEOUT_MS,
  } = options;

  const operationStart = Date.now();
  let totalScanned = 0;
  let totalDeleted = 0;

  try {
    const redis = await getRedisClient();
    if (!redis || redis.status !== 'ready') {
      logger.warn('Redis not ready, skipping cache delByPrefix', { prefix });
      return { success: false, error: 'Redis not ready' };
    }

    // Use SCAN to find keys matching prefix*
    let cursor = '0';
    const keysToDelete = [];

    do {
      const scanStart = Date.now();
      const res = await redis.scan(cursor, {
        MATCH: `${prefix}*`,
        COUNT: scanBatchSize,
      });

      cursor = res.cursor || res[0];
      const batch = res.keys || res[1] || [];

      if (batch.length) {
        keysToDelete.push(...batch);
        totalScanned += batch.length;
      }

      // Check timeout
      if (Date.now() - operationStart > timeoutMs) {
        logger.warn('Cache delByPrefix timeout exceeded', {
          prefix,
          scanned: totalScanned,
          timeoutMs,
        });
        break;
      }

      logger.debug('SCAN iteration', {
        prefix,
        cursor,
        batchSize: batch.length,
        totalKeys: keysToDelete.length,
        scanDuration: Date.now() - scanStart,
      });
    } while (cursor !== '0' && cursor !== 0);

    if (keysToDelete.length === 0) {
      logger.debug('No cache keys to delete', { prefix });
      return {
        success: true,
        deleted: 0,
        scanned: totalScanned,
        duration: Date.now() - operationStart,
      };
    }

    // Deduplicate keys
    const uniqueKeys = [...new Set(keysToDelete)];
    logger.info('Found cache keys to delete', {
      prefix,
      total: uniqueKeys.length,
      scanned: totalScanned,
    });

    if (dryRun) {
      logger.info('DRY RUN: Would delete cache keys', {
        prefix,
        count: uniqueKeys.length,
        sampleKeys: uniqueKeys.slice(0, 10),
      });
      return {
        success: true,
        deleted: 0,
        wouldDelete: uniqueKeys.length,
        dryRun: true,
        duration: Date.now() - operationStart,
      };
    }

    // Chunk keys for deletion
    const chunks = [];
    for (let i = 0; i < uniqueKeys.length; i += deleteChunkSize) {
      chunks.push(uniqueKeys.slice(i, i + deleteChunkSize));
    }

    // Limit concurrency
    const limit = pLimit(maxConcurrent);
    const deletionPromises = chunks.map((chunk, index) =>
      limit(async () => {
        try {
          const deleted = await redis.del(chunk);
          totalDeleted += deleted;
          logger.debug('Deleted chunk', {
            prefix,
            chunkIndex: index + 1,
            chunkSize: chunk.length,
            deletedCount: deleted,
          });
          return deleted;
        } catch (error) {
          logger.error('Failed to delete chunk', {
            prefix,
            chunkIndex: index + 1,
            error: error.message,
          });
          return 0;
        }
      })
    );

    // Wait for all deletions with timeout
    await Promise.race([
      Promise.all(deletionPromises),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Deletion timeout')), timeoutMs)
      ),
    ]);

    const duration = Date.now() - operationStart;
    logger.info('Cache deletion completed', {
      prefix,
      totalDeleted,
      totalScanned,
      duration,
      chunks: chunks.length,
    });

    cacheStats.deletes += totalDeleted;

    return {
      success: true,
      deleted: totalDeleted,
      scanned: totalScanned,
      duration,
      chunks: chunks.length,
    };
  } catch (err) {
    const duration = Date.now() - operationStart;
    cacheStats.errors++;
    logger.error('Cache delByPrefix failed', {
      prefix,
      error: err?.message,
      stack: err.stack,
      scanned: totalScanned,
      deleted: totalDeleted,
      duration,
    });

    return {
      success: false,
      error: err.message,
      deleted: totalDeleted,
      scanned: totalScanned,
      duration,
    };
  }
}

export function getCacheStats() {
  const hitRate =
    cacheStats.hits + cacheStats.misses > 0
      ? ((cacheStats.hits / (cacheStats.hits + cacheStats.misses)) * 100).toFixed(2)
      : 0;

  return {
    ...cacheStats,
    hitRate: `${hitRate}%`,
    totalOperations: cacheStats.hits + cacheStats.misses + cacheStats.sets + cacheStats.deletes,
    timestamp: new Date().toISOString(),
  };
}

// Per-user request-aware cache helpers (includes user id in key)
export async function cacheGetPerUser(req) {
  if (!req.user?.id) return null;
  const key = getCacheKey(req, true); // includeUser=true
  return await cacheGet(key);
}

export async function cacheSetPerUser(req, value, ttl = CONFIG.DEFAULT_TTL) {
  if (!req.user?.id) return null;
  const key = getCacheKey(req, true); // includeUser=true
  return await cacheSet(key, value, ttl);
}

export async function cacheDelPerUser(req) {
  if (!req.user?.id) return null;
  const key = getCacheKey(req, true); // includeUser=true
  return await cacheDel(key);
}

export default {
  get: cacheGet,
  set: cacheSet,
  del: cacheDel,
  delByPrefix: cacheDelByPrefix,
  getCacheKey,
  getCacheStats,
  cacheGetPerUser,
  cacheSetPerUser,
  cacheDelPerUser,
};
