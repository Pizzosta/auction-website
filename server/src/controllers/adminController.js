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

    // Collect keys
    const [timeoutKeys, waitSumKeys, waitCntKeys, bucketKeys] = await Promise.all([
      scanKeys(client, 'metrics:auction:*:lock_timeouts', 200),
      scanKeys(client, 'metrics:auction:*:lock_wait_sum', 200),
      scanKeys(client, 'metrics:auction:*:lock_wait_count', 200),
      scanKeys(client, 'metrics:auction:*:lock_wait_bucket:*', 500),
    ]);

    // Collect values
    const [timeoutVals, waitSumVals, waitCntVals, bucketVals] = await Promise.all([
      timeoutKeys.length ? Promise.all(timeoutKeys.map(k => client.get(k))) : [],
      waitSumKeys.length ? Promise.all(waitSumKeys.map(k => client.get(k))) : [],
      waitCntKeys.length ? Promise.all(waitCntKeys.map(k => client.get(k))) : [],
      bucketKeys.length ? Promise.all(bucketKeys.map(k => client.get(k))) : [],
    ]);

    // Global counters
    const [rl429Total, lock429Total] = await Promise.all([
      client.get('metrics:rate_limit_429_total').then(v => parseInt(v || '0', 10)),
      client.get('metrics:bid_lock_timeout_429_total').then(v => parseInt(v || '0', 10)),
    ]);

    const lines = [];

    // Auction lock timeout counters
    lines.push('# HELP auction_lock_timeouts_total Number of lock timeout 429s per auction');
    lines.push('# TYPE auction_lock_timeouts_total counter');
    timeoutKeys.forEach((k, i) => {
      const m = k.match(/^metrics:auction:(.+):lock_timeouts$/);
      if (!m) return;
      const auctionId = m[1];
      lines.push(
        `auction_lock_timeouts_total{auction_id="${auctionId}"} ${parseInt(timeoutVals[i] || '0', 10)}`
      );
    });

    // Histogram: lock wait ms
    lines.push('# HELP auction_lock_wait_ms Lock wait time distribution per auction');
    lines.push('# TYPE auction_lock_wait_ms histogram');

    // Group histogram data by auction_id
    const grouped = {};
    bucketKeys.forEach((k, i) => {
      const m = k.match(/^metrics:auction:(.+):lock_wait_bucket:(.+)$/);
      if (!m) return;
      const auctionId = m[1];
      const le = m[2] === 'inf' ? '+Inf' : m[2];
      grouped[auctionId] = grouped[auctionId] || { buckets: {}, sum: 0, count: 0 };
      grouped[auctionId].buckets[le] = parseInt(bucketVals[i] || '0', 10);
    });

    waitSumKeys.forEach((k, i) => {
      const m = k.match(/^metrics:auction:(.+):lock_wait_sum$/);
      if (!m) return;
      const auctionId = m[1];
      grouped[auctionId] = grouped[auctionId] || { buckets: {}, sum: 0, count: 0 };
      grouped[auctionId].sum = parseInt(waitSumVals[i] || '0', 10);
    });

    waitCntKeys.forEach((k, i) => {
      const m = k.match(/^metrics:auction:(.+):lock_wait_count$/);
      if (!m) return;
      const auctionId = m[1];
      grouped[auctionId] = grouped[auctionId] || { buckets: {}, sum: 0, count: 0 };
      grouped[auctionId].count = parseInt(waitCntVals[i] || '0', 10);
    });

    // Emit per-auction histogram lines
    for (const [auctionId, data] of Object.entries(grouped)) {
      const bucketBounds = ['10', '50', '100', '200', '500', '1000', '+Inf'];
      for (const le of bucketBounds) {
        const val = data.buckets[le] || 0;
        lines.push(
          `auction_lock_wait_ms_bucket{auction_id="${auctionId}",le="${le}"} ${val}`
        );
      }
      lines.push(`auction_lock_wait_ms_sum{auction_id="${auctionId}"} ${data.sum}`);
      lines.push(`auction_lock_wait_ms_count{auction_id="${auctionId}"} ${data.count}`);
    }

    // Global counters
    lines.push('# HELP bid_lock_timeout_429_total Total 429s due to bid lock timeouts');
    lines.push('# TYPE bid_lock_timeout_429_total counter');
    lines.push(`bid_lock_timeout_429_total ${lock429Total}`);

    lines.push('# HELP rate_limit_429_total Total 429s due to rate limiting');
    lines.push('# TYPE rate_limit_429_total counter');
    lines.push(`rate_limit_429_total ${rl429Total}`);

    lines.push('# EOF'); // Prometheus EOF marker

    res.setHeader('Content-Type', 'text/plain; version=0.0.4');
    res.status(200).send(lines.join('\n') + '\n');
  } catch (error) {
    res.status(500).send(`# Error generating metrics: ${error.message}\n`);
  }
}
