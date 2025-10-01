import { executeRedisCommand } from '../config/redis.js';
import logger from '../utils/logger.js';

const HISTOGRAM_BUCKETS = [10, 50, 100, 200, 500, 1000]; // ms thresholds

export async function recordLockWait(auctionId, waitMs) {
  try {
    // Prometheus counters that you already export
    await executeRedisCommand('incrBy', `metrics:auction:${auctionId}:lock_wait_sum`, waitMs);
    await executeRedisCommand('incr', `metrics:auction:${auctionId}:lock_wait_count`);

    // Increment appropriate buckets - histogram (cumulative style)
    for (const b of HISTOGRAM_BUCKETS) {
      if (waitMs <= b) {
        await executeRedisCommand('incr', `metrics:auction:${auctionId}:lock_wait_bucket:${b}`);
      }
    }
    // Always increment +Inf bucket
    await executeRedisCommand('incr', `metrics:auction:${auctionId}:lock_wait_bucket:inf`);
  } catch (e) {
    logger.warn('Failed to record lock-wait metrics', { auctionId, waitMs, error: e.message });
  }
}