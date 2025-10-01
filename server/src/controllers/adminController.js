import prisma from '../config/prisma.js';
import { getRedisClient } from '../config/redis.js';
import logger from '../utils/logger.js';

// Helper: scan keys with pattern (avoids KEYS on large datasets)
async function scanKeys(client, pattern, count = 100) {
  const keys = [];
  let cursor = '0';
  do {
    const res = await client.scan(cursor, { MATCH: pattern, COUNT: count });
    cursor = res.cursor;
    keys.push(...res.keys);
  } while (cursor !== '0');
  return keys;
}

export async function getHotAuctions(req, res) {
  try {
    const client = await getRedisClient();
    // safer limit parsing
    const limit = Math.max(1, Math.min(Number.parseInt(req.query.limit, 10) || 10, 100));

    const pattern = 'metrics:auction:*:lock_timeouts';
    const keys = await scanKeys(client, pattern, 200);

    if (keys.length === 0) {
      return res.status(200).json({ status: 'success', data: { items: [] } });
    }

    const values = await Promise.all(keys.map(k => client.get(k)));
    const items = keys.map((k, idx) => {
      const match = k.match(/^metrics:auction:(.+):lock_timeouts$/);
      const auctionId = match ? match[1] : 'unknown';
      const count = Number.parseInt(values[idx] || '0', 10);
      return { auctionId, lockTimeouts: count };
    });

    items.sort((a, b) => b.lockTimeouts - a.lockTimeouts);

    res.status(200).json({
      status: 'success',
      data: {
        items: items.slice(0, limit),
        totalTracked: items.length,
      },
    });
  } catch (error) {
    logger.error('getHotAuctions error', { error: error.message, stack: error.stack });
    res.status(500).json({ status: 'error', message: 'Failed to get hot auctions' });
  }
}

// Prometheus metrics exposition (text/plain; version=0.0.4)
export async function getPrometheusMetrics(req, res) {
  try {
    const client = await getRedisClient();

    // Collect auction lock timeout counters
    const timeoutKeys = await scanKeys(client, 'metrics:auction:*:lock_timeouts', 200);
    const timeoutVals = timeoutKeys.length
      ? await Promise.all(timeoutKeys.map(k => client.get(k)))
      : [];

    // Collect lock wait metrics (sum and count)
    const waitSumKeys = await scanKeys(client, 'metrics:auction:*:lock_wait_sum', 200);
    const waitCntKeys = await scanKeys(client, 'metrics:auction:*:lock_wait_count', 200);
    const waitSumVals = waitSumKeys.length
      ? await Promise.all(waitSumKeys.map(k => client.get(k)))
      : [];
    const waitCntVals = waitCntKeys.length
      ? await Promise.all(waitCntKeys.map(k => client.get(k)))
      : [];

    // Collect histogram buckets
    const bucketKeys = await scanKeys(client, 'metrics:auction:*:lock_wait_bucket:*', 500);
    const bucketVals = bucketKeys.length
      ? await Promise.all(bucketKeys.map(k => client.get(k)))
      : [];

    // Global 429 totals
    const rl429Total = Number.parseInt(
      (await client.get('metrics:rate_limit_429_total')) || '0',
      10,
    );
    const lock429Total = Number.parseInt(
      (await client.get('metrics:bid_lock_timeout_429_total')) || '0',
      10,
    );

    // Count currently active auctions in Postgres
    const activeAuctionsCount = await prisma.auction.count({
      where: { status: 'active', isDeleted: false },
    });

    // Active auctions grouped by category
    const activeByCategory = await prisma.auction.groupBy({
      by: ['category'],
      where: { status: 'active', isDeleted: false },
      _count: { _all: true },
    });

    // Count ended auctions
    const endedAuctionsCount = await prisma.auction.count({
      where: { status: 'ended', isDeleted: false },
    });

    // Ended auctions grouped by category
    const endedByCategory = await prisma.auction.groupBy({
      by: ['category'],
      where: { status: 'ended', isDeleted: false },
      _count: { _all: true },
    });

    const lines = [];

    // Lock timeouts
    lines.push('# HELP auction_lock_timeouts_total Number of lock timeout 429s per auction');
    lines.push('# TYPE auction_lock_timeouts_total counter');
    timeoutKeys.forEach((k, i) => {
      const m = k.match(/^metrics:auction:(.+):lock_timeouts$/);
      const auctionId = m ? m[1] : 'unknown';
      lines.push(
        `auction_lock_timeouts_total{auction_id="${auctionId}"} ${Number.parseInt(timeoutVals[i] || '0', 10)}`,
      );
    });

    // Histogram: buckets
    lines.push('# HELP auction_lock_wait_ms Lock wait time distribution per auction');
    lines.push('# TYPE auction_lock_wait_ms histogram');
    bucketKeys.forEach((k, i) => {
      const m = k.match(/^metrics:auction:(.+):lock_wait_bucket:(.+)$/);
      if (!m) return;
      const auctionId = m[1];
      const le = m[2] === 'inf' ? '+Inf' : m[2];
      lines.push(
        `auction_lock_wait_ms_bucket{auction_id="${auctionId}",le="${le}"} ${Number.parseInt(bucketVals[i] || '0', 10)}`,
      );
    });

    // Histogram: sum
    waitSumKeys.forEach((k, i) => {
      const m = k.match(/^metrics:auction:(.+):lock_wait_sum$/);
      const auctionId = m ? m[1] : 'unknown';
      lines.push(
        `auction_lock_wait_ms_sum{auction_id="${auctionId}"} ${Number.parseInt(waitSumVals[i] || '0', 10)}`,
      );
    });

    // Histogram: count
    waitCntKeys.forEach((k, i) => {
      const m = k.match(/^metrics:auction:(.+):lock_wait_count$/);
      const auctionId = m ? m[1] : 'unknown';
      lines.push(
        `auction_lock_wait_ms_count{auction_id="${auctionId}"} ${Number.parseInt(waitCntVals[i] || '0', 10)}`,
      );
    });

    // Global counters
    lines.push('# HELP bid_lock_timeout_429_total Total 429s due to bid lock timeouts');
    lines.push('# TYPE bid_lock_timeout_429_total counter');
    lines.push(`bid_lock_timeout_429_total ${lock429Total}`);

    lines.push('# HELP rate_limit_429_total Total 429s due to rate limiting');
    lines.push('# TYPE rate_limit_429_total counter');
    lines.push(`rate_limit_429_total ${rl429Total}`);

    // Global active auctions gauge
    lines.push('# HELP auction_active_total Current number of active auctions');
    lines.push('# TYPE auction_active_total gauge');
    lines.push(`auction_active_total ${activeAuctionsCount}`);

    // Active auctions per category gauge
    lines.push('# HELP auction_active_by_category_total Current number of active auctions per category');
    lines.push('# TYPE auction_active_by_category_total gauge');
    activeByCategory.forEach(entry => {
      const category = entry.category || 'uncategorized';
      lines.push(`auction_active_by_category_total{category="${category}"} ${entry._count._all}`);
    });

    // Global ended auctions gauge
    lines.push('# HELP auction_ended_total Current number of ended auctions');
    lines.push('# TYPE auction_ended_total gauge');
    lines.push(`auction_ended_total ${endedAuctionsCount}`);

    // Ended auctions per category gauge
    lines.push('# HELP auction_ended_by_category_total Current number of ended auctions per category');
    lines.push('# TYPE auction_ended_by_category_total gauge');
    endedByCategory.forEach(entry => {
      const category = entry.category || 'uncategorized';
      lines.push(`auction_ended_by_category_total{category="${category}"} ${entry._count._all}`);
    });

    lines.push('# EOF'); // Prometheus EOF marker

    res.setHeader('Content-Type', 'text/plain; version=0.0.4');
    res.status(200).send(lines.join('\n') + '\n');
  } catch (error) {
    res.status(500).send(`# Error generating metrics: ${error.message}\n`);
  }
}