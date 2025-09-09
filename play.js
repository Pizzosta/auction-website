import axios from 'axios';
import dotenv from 'dotenv';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file
const envPath = path.resolve(__dirname, '../../.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  console.warn('No .env file found, using process.env');
}

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:5001/api';

// Create axios instance with default config
const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // Important for cookies
  httpsAgent: new https.Agent({ 
    rejectUnauthorized: false, // Only for development
  }),
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
  validateStatus: () => true, // Don't throw on HTTP error status
});

// Store cookies between requests
let cookies = [];

// Add request interceptor to include cookies in each request
api.interceptors.request.use(config => {
  console.log(`\n[Request] ${config.method?.toUpperCase()} ${config.url}`);
  if (config.data) {
    console.log('Request data:', JSON.stringify(config.data, null, 2));
  }
  
  if (cookies.length > 0) {
    config.headers.Cookie = cookies.join('; ');
    console.log('Sending cookies:', cookies);
  }
  
  return config;
});

// Add response interceptor to store cookies from responses
api.interceptors.response.use(response => {
  console.log(`[Response] ${response.status} ${response.statusText}`);
  console.log('Response headers:', JSON.stringify(response.headers, null, 2));
  
  if (response.data) {
    console.log('Response data:', JSON.stringify(response.data, null, 2));
  }

  const newCookies = response.headers['set-cookie'] || [];
  console.log('Received cookies:', newCookies);
  
  if (newCookies.length > 0) {
    // Update stored cookies with new ones
    newCookies.forEach(cookie => {
      const [keyValue] = cookie.split(';');
      const [key] = keyValue.split('=');
      // Remove old cookie if it exists
      cookies = cookies.filter(c => !c.startsWith(`${key}=`));
      cookies.push(keyValue);
    });
    console.log('Updated cookies:', cookies);
  }
  
  return response;
}, error => {
  if (error.response) {
    console.error('Response error:', {
      status: error.response.status,
      statusText: error.response.statusText,
      headers: error.response.headers,
      data: error.response.data,
    });
  } else if (error.request) {
    console.error('No response received:', error.request);
  } else {
    console.error('Request setup error:', error.message);
  }
  return Promise.reject(error);
});

const testLogin = async () => {
  const credentials = {
    email: 'Regtest3@example.com',
    password: 'Regtest3@example.com'
  };

  console.log('\n=== Starting Authentication Test ===');
  console.log(`API Base URL: ${API_BASE_URL}`);
  console.log('Using credentials:', { email: credentials.email, password: '********' });

  try {
    // Step 1: Login
    console.log('\n1. Attempting to login...');
    const loginResponse = await api.post('/auth/login', credentials);
    
    console.log('✅ Login successful!');
    console.log('Response status:', loginResponse.status);
    
    const accessToken = loginResponse.data.token;
    console.log('Access token received');
    
    // Check for refresh token in cookies
    const cookies = loginResponse.headers['set-cookie'];
    const hasRefreshToken = cookies && cookies.some(cookie => cookie.includes('refreshToken'));
    console.log(`Refresh token cookie ${hasRefreshToken ? 'found' : 'not found'}`);

    // Step 2: Test protected route
    if (accessToken) {
      console.log('\n2. Testing protected route...');
      try {
        const profileResponse = await api.get('/users/me', {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        console.log('✅ Successfully accessed protected route');
        console.log('User profile:', JSON.stringify(profileResponse.data, null, 2));
      } catch (error) {
        console.error('❌ Failed to access protected route:', error.response?.data?.message || error.message);
      }
    }

    // Step 3: Test token refresh
    if (hasRefreshToken) {
      console.log('\n3. Testing token refresh...');
      try {
        const refreshResponse = await api.post('/auth/refresh-token');
        console.log('✅ Token refresh successful');
        console.log('New access token received');
        
        // Test new access token
        if (refreshResponse.data.token) {
          const newProfileResponse = await api.get('/users/me', {
            headers: { 'Authorization': `Bearer ${refreshResponse.data.token}` }
          });
          console.log('✅ Successfully used new access token');
        }
      } catch (error) {
        console.error('❌ Token refresh failed:', error.response?.data?.message || error.message);
      }
    }

    // Step 4: Logout
    console.log('\n4. Testing logout...');
    try {
      await api.post('/auth/logout');
      console.log('✅ Logout successful');
      
      // Verify token is invalidated
      try {
        await api.get('/users/me', {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        console.log('❌ Token still valid after logout');
      } catch (error) {
        console.log('✅ Token successfully invalidated after logout');
      }
    } catch (error) {
      console.error('❌ Logout failed:', error.response?.data?.message || error.message);
    }

  } catch (error) {
    console.error('\n❌ Test failed with error:', {
      status: error.response?.status,
      message: error.response?.data?.message || error.message,
      url: error.config?.url,
      method: error.config?.method
    });
    
    if (error.response?.data?.stack && env.NODE_ENV !== 'production') {
      console.error('\nError details:', error.response.data);
    }
  }
};

// Run the test
console.log('Starting authentication test...');
testLogin()
  .then(() => console.log('\n=== Test completed ==='))
  .catch(err => console.error('Test failed:', err));
