import { env } from '../src/config/env.js';

// Helper function to format time in milliseconds to human-readable format
const formatTime = (ms) => {
  if (!ms) return 'Not set';
  const seconds = Math.floor(ms / 1000) % 60;
  const minutes = Math.floor(ms / (1000 * 60)) % 60;
  const hours = Math.floor(ms / (1000 * 60 * 60));
  
  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 && hours === 0) parts.push(`${seconds}s`);
  
  return `${parts.join(' ')} (${ms}ms)`;
};

console.log('Rate Limit Configuration:');
console.log('------------------------');
console.log('Global:');
console.log(`- Window: ${formatTime(env.rateLimit.windowMs)}`);
console.log(`- Max Requests: ${env.rateLimit.max}`);
console.log('\nForgot Password:');
console.log(`- Window: ${formatTime(env.rateLimit.forgotPassword.windowMs)}`);
console.log(`- Max Requests: ${env.rateLimit.forgotPassword.max}`);

console.log('\nOther Rate Limits:');
console.log('- OTP:');
console.log(`  - Window: ${formatTime(env.rateLimit.otp.windowMs)}`);
console.log(`  - Max: ${env.rateLimit.otp.max}`);
console.log('- Login:');
console.log(`  - Window: ${formatTime(env.rateLimit.login.windowMs)}`);
console.log(`  - Max: ${env.rateLimit.login.max}`);
console.log('- Bid:');
console.log(`  - Window: ${formatTime(env.rateLimit.bid.windowMs)}`);
console.log(`  - Max: ${env.rateLimit.bid.max}`);

// Check if Redis is configured
console.log('\nRedis Configuration:');
console.log(`- Host: ${env.redis.host || '127.0.0.1'}`);
console.log(`- Port: ${env.redis.port || 6379}`);
console.log(`- TLS: ${env.redis.tls ? 'Enabled' : 'Disabled'}`);

// Check if rate-limit-redis is installed
try {
  require.resolve('rate-limit-redis');
  console.log('\n✅ rate-limit-redis is installed');
} catch (e) {
  console.log('\n❌ rate-limit-redis is NOT installed');
}

// Check Redis connection
import { getRedisClient } from '../src/config/redis.js';

async function testRedisConnection() {
  try {
    const client = await getRedisClient();
    await client.set('test:connection', 'success');
    const result = await client.get('test:connection');
    console.log('\n✅ Redis connection test:', result === 'success' ? 'Success' : 'Failed');
    return true;
  } catch (error) {
    console.error('\n❌ Redis connection failed:', error.message);
    return false;
  }
}

testRedisConnection().then(() => process.exit(0));
