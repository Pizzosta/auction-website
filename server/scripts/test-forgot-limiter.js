// test-forgot-limiter.js
import axios from 'axios';

const BASE_URL = 'http://localhost:5001/api/auth';
const EMAIL = 'Regtest3@example.com';

async function testForgotLimiter() {
  console.log('Testing forgot password rate limiter...\n');
  
  // Make 6 requests in sequence
  for (let i = 1; i <= 6; i++) {
    try {
      const response = await axios.post(
        `${BASE_URL}/forgot-password`,
        { email: EMAIL },
        { 
          validateStatus: status => status < 500 // Don't throw on 4xx errors
        }
      );
      
      console.log(`Request ${i}: Status ${response.status} - ${response.statusText}`);
      if (response.data?.message) {
        console.log(`  Message: ${response.data.message}`);
      }
    } catch (error) {
      console.error(`Request ${i} failed:`, error.message);
      if (error.response) {
        console.error(`  Status: ${error.response.status}`);
        console.error(`  Data:`, error.response.data);
      }
    }
    
    // Small delay between requests
    if (i < 6) await new Promise(resolve => setTimeout(resolve, 100));
  }
}

testForgotLimiter().catch(console.error);