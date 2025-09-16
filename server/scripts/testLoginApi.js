import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

// Base URL of your API
const API_URL = process.env.API_URL || 'http://localhost:5001/api';

console.log('Using API URL:', API_URL);

async function testLogin() {
  const loginData = {
    email: 'Regtest3@example.com',
    password: 'Regtest3@example.com'
  };

  console.log('Testing login API with:', loginData.email);

  try {
    const response = await axios.post(`${API_URL}/auth/login`, loginData, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ Login successful!');
    console.log('Response status:', response.status);
    console.log('Response data:', {
      status: response.data.status,
      user: response.data.data.user.email,
      accessToken: response.data.data.accessToken ? '***' : 'Not found',
      hasRefreshToken: !!response.headers['set-cookie']
    });
    
    if (response.headers['set-cookie']) {
      console.log('✅ Refresh token cookie is set');
    } else {
      console.warn('⚠️  No refresh token cookie found in response');
    }

  } catch (error) {
    console.error('❌ Login failed:', error.response?.data || error.message);
    
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

testLogin();
