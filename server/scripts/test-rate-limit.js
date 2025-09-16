// Updated test script with better logging and error handling
import axios from 'axios';

const BASE_URL = 'http://localhost:5001/api/auth';
const EMAIL = 'test@example.com';

async function makeRequest(i) {
  try {
    const start = Date.now();
    const response = await axios.post(
      `${BASE_URL}/forgot-password`,
      { email: EMAIL },
      { 
        validateStatus: () => true // Don't throw on any status code
      }
    );
    
    const time = Date.now() - start;
    console.log(`[${i}] ${new Date().toISOString()} - Status: ${response.status} (${time}ms)`);
    if (response.data?.message) {
      console.log(`   Message: ${response.data.message}`);
    }
    if (response.headers['retry-after']) {
      console.log(`   Retry after: ${response.headers['retry-after']}s`);
    }
    return response.status;
  } catch (error) {
    console.error(`[${i}] Error:`, error.message);
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Data:`, error.response.data);
    }
    return error.response?.status || 500;
  }
}

async function testRateLimit() {
  console.log('Testing forgot password rate limiter...\n');
  console.log('Expected behavior:');
  console.log('- First 5 requests should succeed (status 200)');
  console.log('- 6th+ request should be rate limited (status 429)');
  console.log('- After 5 minutes, the limit should reset\n');
  
  // Make 10 requests in parallel
  const requests = Array(10).fill().map((_, i) => makeRequest(i + 1));
  const results = await Promise.all(requests);
  
  // Count successes and rate limits
  const successCount = results.filter(status => status === 200).length;
  const rateLimitedCount = results.filter(status => status === 429).length;
  
  console.log(`\nTest Results:`);
  console.log(`- Successful requests: ${successCount}/10`);
  console.log(`- Rate limited requests: ${rateLimitedCount}/10`);
  
  if (successCount === 5 && rateLimitedCount === 5) {
    console.log('\n✅ Rate limiting is working correctly!');
  } else {
    console.log('\n❌ Rate limiting is NOT working as expected');
    console.log('Check your server configuration:');
    console.log('1. Is the rate limiter middleware properly applied to the forgot-password route?');
    console.log('2. Is Redis running and properly configured?');
    console.log('3. Are there any environment variables overriding the rate limit settings?');
  }
}

testRateLimit().catch(console.error);