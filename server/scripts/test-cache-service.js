#!/usr/bin/env node
import cacheService, { getCacheKey } from '../src/services/cacheService.js';
import { getRedisClient, closeRedisClient } from '../src/config/redisAdapter.js';

async function run() {
  console.log('Starting cacheService quickcheck...');

  // Ensure Redis client connects (will throw if not available)
  try {
    await getRedisClient();
    console.log('Redis client ready.');
  } catch (err) {
    console.error('Failed to connect to Redis. Please ensure Redis is running locally.');
    console.error(err?.message || err);
    process.exit(2);
  }

  const req = {
    method: 'GET',
    baseUrl: '/api/v1',
    path: '/test-cache',
    query: { foo: 'bar' },
    user: { id: 'test-user' },
  };

  const key = getCacheKey(req);
  console.log('Generated cache key:', key);

  try {
    const payload = { status: 200, body: { msg: 'hello', now: new Date() } };

    console.log('Setting cache...');
    await cacheService.set(req, payload, 10);
    console.log('Set completed.');

    console.log('Getting cache...');
    const got = await cacheService.get(req);
    console.log('Get result:', got);

    console.log('Cache stats after set/get:', cacheService.getCacheStats());

    console.log('Deleting key...');
    await cacheService.del(req);
    const afterDel = await cacheService.get(req);
    console.log('Get after del (should be null):', afterDel);

    console.log('Testing delByPrefix for the prefix of this key...');
    const delRes = await cacheService.delByPrefix(key);
    console.log('delByPrefix result:', delRes);

    console.log('Testing per-user cache helpers (they may surface known issues)');
    try {
      await cacheService.cacheSetPerUser(req, { per: 'user', now: new Date() }, 10);
      const perUser = await cacheService.cacheGetPerUser(req);
      console.log('Per-user get result:', perUser);
    } catch (err) {
      console.error('Per-user helper threw an error (this is expected if implementation is buggy):', err?.message || err);
    }
  } catch (err) {
    console.error('Error during cacheService quickcheck:', err?.message || err);
    console.error(err?.stack || '');
  } finally {
    try {
      await closeRedisClient();
      console.log('Closed Redis client.');
    } catch (e) {}
  }
}

run().then(() => process.exit(0)).catch(e => {
  console.error(e?.message || e);
  process.exit(1);
});
