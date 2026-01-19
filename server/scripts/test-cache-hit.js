import cacheService from '../src/services/cacheService.js';
import { getRedisClient, closeRedisClient } from '../src/config/redisAdapter.js';

const mockReq = {
  method: 'GET',
  baseUrl: '/api/v1',
  path: '/users',
  query: {
    status: 'active',
    sort: 'createdAt',
    order: 'desc',
    page: '1',
    limit: '10',
  },
  user: {
    id: '172300aa-3ed1-45b9-8e1a-7ca347c475dc',
  },
};

console.log('Test cache GET with per-user key...');
console.log('Mock request:', mockReq);

const cacheKey = cacheService.getCacheKey(mockReq, true);
console.log('Generated cache key:', cacheKey);

await getRedisClient();

const cached = await cacheService.cacheGetPerUser(mockReq);
console.log('\nResult from cacheGetPerUser:', cached ? 'Found' : 'NOT FOUND');

if (cached) {
  console.log('Cached body keys:', Object.keys(cached.body || {}).slice(0, 3));
  console.log('Cached _meta:', cached._meta);
}

const redis = await getRedisClient();
const raw = await redis.get(cacheKey);
console.log('\nDirect Redis GET on key:', raw ? 'Found' : 'NOT FOUND');

await closeRedisClient();
