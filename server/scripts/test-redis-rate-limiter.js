import { getRedisClient } from '../src/config/redis.js';
import { rateLimit } from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import express from 'express';

// Test Redis connection
async function testRedisConnection() {
  try {
    console.log('Testing Redis connection...');
    const client = await getRedisClient();
    
    // Test basic Redis commands
    await client.set('test:connection', 'success');
    const result = await client.get('test:connection');
    
    console.log('✅ Redis connection test:', result === 'success' ? 'Success' : 'Failed');
    return true;
  } catch (error) {
    console.error('❌ Redis connection failed:', error.message);
    return false;
  }
}

// Test rate limiter with Redis store
async function testRateLimiter() {
  const app = express();
  
  // Create a test endpoint with rate limiting
  const testLimiter = rateLimit({
    windowMs: 60000, // 1 minute
    max: 3, // Limit each IP to 3 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
    store: new RedisStore({
      sendCommand: async (...args) => {
        const client = await getRedisClient();
        return client.sendCommand(args);
      },
      prefix: 'test-rate-limit:',
    }),
  });

  // Test endpoint
  app.get('/test-limit', testLimiter, (req, res) => {
    res.json({ success: true, message: 'Request processed' });
  });

  // Start test server
  const server = app.listen(5002, () => {
    console.log('Test server running on port 5002');
  });

  // Run test requests
  const makeRequest = async (i) => {
    try {
      const response = await fetch('http://localhost:5002/test-limit');
      const data = await response.json();
      console.log(`[${i}] Status: ${response.status} - ${data.message}`);
      if (response.headers.get('retry-after')) {
        console.log(`   Retry after: ${response.headers.get('retry-after')}s`);
      }
      return response.status;
    } catch (error) {
      console.error(`[${i}] Error:`, error.message);
      return 500;
    }
  };

  try {
    console.log('\nTesting rate limiter...');
    console.log('Expected: First 3 requests should succeed, 4th should be rate limited');
    
    // Make 4 requests
    for (let i = 1; i <= 4; i++) {
      const status = await makeRequest(i);
      if (i === 4 && status !== 429) {
        console.log('❌ Rate limiter test failed: 4th request was not rate limited');
        return false;
      }
    }
    
    console.log('✅ Rate limiter test passed!');
    return true;
  } finally {
    // Clean up
    server.close();
  }
}

// Run tests
async function runTests() {
  const redisConnected = await testRedisConnection();
  
  if (redisConnected) {
    await testRateLimiter();
  } else {
    console.log('Skipping rate limiter test due to Redis connection failure');
  }
  
  process.exit(0);
}

runTests().catch(console.error);
