import axios from 'axios';
import dotenv from 'dotenv';
import https from 'https';

// Load environment variables
dotenv.config();

const API_BASE_URL = 'http://localhost:5001/api';
const AUTH_BASE_URL = `${API_BASE_URL}/auth`;
const USER_CREDENTIALS = {
  email: 'Regtest3@example.com',
  password: 'Regtest3@example.com'
};

// Create axios instance that will save cookies
const api = axios.create({
  baseURL: 'http://localhost:5001',
  withCredentials: true, // This is important for cookies
  httpsAgent: new https.Agent({ rejectUnauthorized: false }), // Only for development
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }
});

// Helper to get cookie string from response
const getCookiesFromResponse = (response) => {
  const cookies = response.headers['set-cookie'] || [];
  return cookies.join('; ');
};

// Helper to create axios instance with cookies
const createApiWithCookies = (cookies = '') => {
  return axios.create({
    baseURL: 'http://localhost:5001',
    withCredentials: true,
    httpsAgent: new https.Agent({ rejectUnauthorized: false }),
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Cookie': cookies
    }
  });
};

async function testAuthFlow() {
  try {
    console.log('=== Testing Authentication Flow ===');
    
    // 1. Login
    console.log('\n1. Logging in...');
    const loginRes = await api.post(`${AUTH_BASE_URL}/login`, USER_CREDENTIALS);
    const { accessToken } = loginRes.data.data;
    const cookies = getCookiesFromResponse(loginRes);
    console.log('Login successful! Access token received.');
    
    // Create a new API instance with the received cookies
    const authedApi = createApiWithCookies(cookies);
    
    // 2. Get current user with access token
    console.log('\n2. Getting current user...');
    const userRes = await authedApi.get(`${API_BASE_URL}/users/me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
    console.log('Current user:', userRes.data.data);
    
    // 3. Test refresh token
    console.log('\n3. Testing token refresh...');
    const refreshRes = await authedApi.post(`${AUTH_BASE_URL}/refresh-token`);
    const newAccessToken = refreshRes.data.data.accessToken;
    const newCookies = getCookiesFromResponse(refreshRes) || cookies;
    console.log('Token refreshed! New access token received.');
    
    // Create a new API instance with the updated cookies
    const refreshedApi = createApiWithCookies(newCookies);
    
    // 4. Get current user with new access token
    console.log('\n4. Getting current user with new token...');
    const newUserRes = await refreshedApi.get(`${API_BASE_URL}/users/me`, {
      headers: {
        Authorization: `Bearer ${newAccessToken}`
      }
    });
    console.log('Current user with new token:', newUserRes.data.data);
    
    // 5. Logout
    console.log('\n5. Logging out...');
    try {
      await refreshedApi.post(`${AUTH_BASE_URL}/logout`);
      console.log('Logout successful!');
    } catch (error) {
      console.log('Logout error:', error.response?.data?.message || error.message);
    }
    
    // 6. Try to access protected route after logout
    console.log('\n6. Testing protected route after logout...');
    try {
      await api.get(`${API_BASE_URL}/users/me`, {
        headers: {
          Authorization: `Bearer ${newAccessToken}`
        }
      });
    } catch (error) {
      console.log('Access denied as expected after logout:', error.response?.data?.message || error.message);
    }
    
    console.log('\n=== Authentication flow test completed successfully! ===');
  } catch (error) {
    console.error('Test failed:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status
    });
    process.exit(1);
  }
}

testAuthFlow();
