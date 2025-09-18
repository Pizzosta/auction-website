import axios from 'axios';

const API_BASE_URL = 'http://localhost:5001/api/admin';
const AUTH_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI4NWViOWZkZi1jZTI1LTQ0NjgtYjRjYi05Yzc5MTlhMDZmNTAiLCJlbWFpbCI6InRlc3QxQGV4YW1wbGUuY29tIiwicm9sZSI6ImFkbWluIiwidHlwZSI6ImFjY2VzcyIsImlhdCI6MTc1ODIwMTA2MCwiZXhwIjoxNzU4MjAxOTYwfQ.wj0kWQzez7CC4SPl-dy369WlAd284k6M_LnNnypYgZs';

const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Authorization': `Bearer ${AUTH_TOKEN}`
    // Removed Content-Type since we're not sending a body
  },
  timeout: 10000 // 10 seconds timeout
});

async function testEndpoint(endpoint, method = 'get', data = null) {
  const startTime = Date.now();
  console.log(`\nTesting ${method.toUpperCase()} ${endpoint}...`);
  
  try {
    const config = {
      method,
      url: endpoint,
      // Only include headers if they're needed
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`
      }
    };
    
    // Only add data for POST/PUT/PATCH requests
    if (data && ['post', 'put', 'patch'].includes(method.toLowerCase())) {
      config.data = data;
      config.headers['Content-Type'] = 'application/json';
    }
    
    const response = await axiosInstance(config);
    
    const responseTime = Date.now() - startTime;
    
    console.log(`✅ Success (${responseTime}ms)`);
    console.log('Status:', response.status);
    console.log('Response:', JSON.stringify(response.data, null, 2));
    return true;
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error(`❌ Error (${responseTime}ms):`, error.message);
    
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      console.error('No response received. Request was made but no response.');
      console.error('Request:', error.request);
    } else {
      console.error('Error setting up request:', error.message);
    }
    
    return false;
  }
}

async function runTests() {
  console.log('Starting admin endpoints test...');
  
  // Test hot-auctions endpoint
  await testEndpoint('/hot-auctions');
  
  // Test metrics endpoint
  await testEndpoint('/metrics');
  
  console.log('\nTest completed.');
}

// Run the tests
runTests().catch(console.error);