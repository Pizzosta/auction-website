import axios from 'axios';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Base URL of your API
const API_URL = process.env.API_URL || 'http://localhost:5000/api';

// Create an axios instance with default config
const api = axios.create({
  baseURL: API_URL,
  withCredentials: true, // Important for cookies
  headers: {
    'Content-Type': 'application/json',
  },
});

async function testLogin() {
  try {
    // 1. First, get CSRF token
    console.log('Fetching CSRF token...');
    const csrfResponse = await api.get('/auth/csrf-token');
    const csrfToken = csrfResponse.headers['x-csrf-token'];
    
    if (!csrfToken) {
      throw new Error('No CSRF token received');
    }
    
    console.log('✅ CSRF token received');
    
    // 2. Now try to login with the CSRF token
    console.log('\nAttempting login...');
    const loginData = {
      email: 'Regtest3@example.com',
      password: 'Regtest3@example.com'
    };

    const loginResponse = await api.post('/auth/login', loginData, {
      headers: {
        'x-csrf-token': csrfToken,
      },
    });

    console.log('\n✅ Login successful!');
    console.log('Status:', loginResponse.status);
    console.log('User:', loginResponse.data.data.user.email);
    console.log('Access Token:', loginResponse.data.data.accessToken ? '***' : 'Not found');
    
    if (loginResponse.headers['set-cookie']) {
      console.log('✅ Refresh token cookie is set');
    } else {
      console.warn('⚠️  No refresh token cookie found');
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Response:', error.response.data);
    }
  }
}

testLogin();
