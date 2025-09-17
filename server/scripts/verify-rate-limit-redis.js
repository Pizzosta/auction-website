// Verify limiter uses Redis as primary and observe decreasing Retry-After
import axios from 'axios';
import { getRedisClient } from '../src/config/redis.js';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5001';
const ENDPOINT = `${BASE_URL}/api/auth/forgot-password`;
const EMAIL = process.env.TEST_EMAIL || 'test@example.com';

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getRedisInfo() {
  try {
    const client = await getRedisClient();
    const pong = await client.ping();
    // Find any limiter keys for forgot-password
    const pattern = 'rl:forgot-password:*';
    let cursor = '0';
    let keys = [];
    do {
      const reply = await client.scan(cursor, { MATCH: pattern, COUNT: 50 });
      cursor = reply.cursor || reply[0];
      const batch = reply.keys || reply[1] || [];
      keys = keys.concat(batch);
    } while (cursor !== '0');

    let ttlSample = null;
    if (keys.length > 0) {
      // Check TTL of the first key
      const ttl = await client.ttl(keys[0]);
      ttlSample = { key: keys[0], ttlSeconds: ttl };
    }

    return { connected: pong === 'PONG', keysCount: keys.length, ttlSample };
  } catch (e) {
    return { connected: false, error: e?.message };
  }
}

async function hitForgot(i) {
  const res = await axios.post(ENDPOINT, { email: EMAIL }, { validateStatus: () => true });
  const retryAfter = res.headers['retry-after'] || null;
  const backend = res.headers['x-rate-limit-backend'] || '-';
  const msg = res.data?.message || '';
  console.log(
    `[${i}] status=${res.status} backend=${backend} retry-after=${retryAfter ?? '-'} msg="${msg}"`
  );
  return { status: res.status, retryAfter: retryAfter ? Number(retryAfter) : null, backend };
}

async function main() {
  console.log(`Testing limiter at: ${ENDPOINT}`);
  const info1 = await getRedisInfo();
  console.log('Redis before:', info1);

  console.log('\nSending 7 sequential requests...');
  for (let i = 1; i <= 7; i += 1) {
    await hitForgot(i);
    await sleep(800); // small spacing
  }

  console.log('\nWait 5 seconds and retry to see decreasing Retry-After...');
  await sleep(5000);
  await hitForgot('again');

  const info2 = await getRedisInfo();
  console.log('\nRedis after:', info2);

  if (info2.connected && info2.keysCount > 0) {
    console.log('\n✅ Redis is in use for rate limiting (keys present).');
  } else if (!info2.connected) {
    console.log('\n⚠️ Redis not connected; limiter likely using in-memory fallback.');
  } else {
    console.log('\n⚠️ No limiter keys found; double-check route wiring or key pattern.');
  }
}

main().catch(err => {
  console.error('Test failed:', err?.message || err);
  process.exit(1);
});
