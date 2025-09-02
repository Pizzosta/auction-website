import request from 'supertest';
import { createTestServer } from '../testServer.js';
import mongoose from 'mongoose';
import { describe, it, before, after, beforeEach, afterEach } from 'mocha';
import crypto from 'crypto';
import User from '../../src/models/User.js';
import { 
  connectDB, 
  closeDB, 
  clearDB, 
  createTestUser,
  testUser as testUserData
} from '../testHelpers.js';

// Test data
let server, testUser, authToken;

// Setup and teardown
before(async () => {
  await connectDB();
  await clearDB();
  
  // Create a test user
  const userData = await createTestUser(testUserData);
  testUser = userData.user;
  authToken = userData.token;
  
  // Start test server
  server = await createTestServer();
});

after(async () => {
  if (server) {
    await server.stop();
  }
  await closeDB();
});

describe('Auth Controller', () => {
  describe('POST /api/auth/register', () => {
    it('should register a new user', async () => {
      const userData = {
        firstname: 'John',
        lastname: 'Doe',
        username: 'johndoe',
        email: 'john.doe@example.com',
        phone: '1234567890',
        password: 'SecurePass123!',
        confirmPassword: 'SecurePass123!'
      };
      
      const res = await request(server.app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);
      
      expect(res.body).toHaveProperty('status', 'success');
      expect(res.body).toHaveProperty('data.user');
      expect(res.body.data.user).toHaveProperty('_id');
      expect(res.body.data.user).toHaveProperty('email', userData.email.toLowerCase());
      expect(res.body.data.user).not.toHaveProperty('password');
      
      // Verify the user was saved to the database
      const user = await User.findOne({ email: userData.email.toLowerCase() });
      expect(user).toBeDefined();
      expect(user.isVerified).toBe(false); // Should be false until email is verified
    });

    it('should return 400 for invalid registration data', async () => {
      const invalidUserData = {
        firstname: '', // Missing firstname
        lastname: 'Doe',
        email: 'invalid-email', // Invalid email
        password: 'weak', // Weak password
        confirmPassword: 'mismatch' // Mismatch
      };
      
      const res = await request(server.app)
        .post('/api/auth/register')
        .send(invalidUserData)
        .expect(400);
      
      expect(res.body).toHaveProperty('status', 'error');
      expect(res.body).toHaveProperty('message');
    });

    it('should return 400 for duplicate email or username', async () => {
      const duplicateUserData = {
        firstname: 'Test',
        lastname: 'User',
        username: 'testuser', // Duplicate username
        email: 'test@example.com', // Duplicate email
        password: 'Test123!',
        confirmPassword: 'Test123!'
      };
      
      const res = await request(server.app)
        .post('/api/auth/register')
        .send(duplicateUserData)
        .expect(400);
      
      expect(res.body.status).toBe('error');
      expect(['Email is already in use', 'Username is already taken']).toContain(res.body.message);
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login with correct credentials', async () => {
      const credentials = {
        email: 'test@example.com',
        password: 'Test123!'
      };
      
      const res = await request(server.app)
        .post('/api/auth/login')
        .send(credentials)
        .expect(200);
      
      expect(res.body).toHaveProperty('status', 'success');
      expect(res.body).toHaveProperty('token');
      expect(res.body.data).toHaveProperty('user');
      expect(res.body.data.user).toHaveProperty('_id');
      expect(res.body.data.user).not.toHaveProperty('password');
    });

    it('should return 401 for incorrect password', async () => {
      const res = await request(server.app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'wrongpassword'
        })
        .expect(401);
      
      expect(res.body).toHaveProperty('status', 'error');
      expect(res.body).toHaveProperty('message', 'Invalid credentials');
    });

    it('should return 400 for non-existent email', async () => {
      const res = await request(server.app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'somepassword'
        })
        .expect(400);
      
      expect(res.body).toHaveProperty('status', 'error');
      expect(res.body).toHaveProperty('message', 'User not found');
    });

    it('should return 403 for unverified email', async () => {
      // Create an unverified user
      const unverifiedUser = new User({
        username: 'unverified',
        email: 'unverified@example.com',
        password: 'Test123!',
        isVerified: false
      });
      await unverifiedUser.save();
      
      const res = await request(server.app)
        .post('/api/auth/login')
        .send({
          email: 'unverified@example.com',
          password: 'Test123!'
        })
        .expect(403);
      
      expect(res.body).toHaveProperty('status', 'error');
      expect(res.body).toHaveProperty('message', 'Please verify your email first');
    });
  });

  describe('POST /api/auth/forgot-password', () => {
    it('should generate a reset token for valid email', async () => {
      const res = await request(server.app)
        .post('/api/auth/forgot-password')
        .send({ email: 'test@example.com' })
        .expect(200);
      
      expect(res.body).toHaveProperty('status', 'success');
      expect(res.body).toHaveProperty('message', 'Password reset email sent');
      
      // Verify the reset token was generated
      const user = await User.findOne({ email: 'test@example.com' });
      expect(user.resetPasswordToken).toBeDefined();
      expect(user.resetPasswordExpire).toBeDefined();
    });

    it('should return 404 for non-existent email', async () => {
      const res = await request(server.app)
        .post('/api/auth/forgot-password')
        .send({ email: 'nonexistent@example.com' })
        .expect(404);
      
      expect(res.body).toHaveProperty('status', 'error');
      expect(res.body).toHaveProperty('message', 'User not found');
    });
  });

  describe('PUT /api/auth/reset-password/:token', () => {
    let resetToken;
    
    beforeEach(async () => {
      // Create a reset token for testing
      resetToken = crypto.randomBytes(20).toString('hex');
      const resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 minutes
      
      await User.findByIdAndUpdate(testUserData._id, {
        resetPasswordToken: resetToken,
        resetPasswordExpire
      });
    });
    
    it('should reset password with a valid token', async () => {
      const newPassword = 'NewSecurePass123!';
      
      const res = await request(server.app)
        .put(`/api/auth/reset-password/${resetToken}`)
        .send({
          password: newPassword,
          confirmPassword: newPassword
        })
        .expect(200);
      
      expect(res.body).toHaveProperty('status', 'success');
      expect(res.body).toHaveProperty('message', 'Password reset successful');
      
      // Verify the password was updated
      const user = await User.findById(testUserData._id).select('+password');
      const isMatch = await user.matchPassword(newPassword);
      expect(isMatch).toBe(true);
      
      // Verify the reset token was cleared
      expect(user.resetPasswordToken).toBeUndefined();
      expect(user.resetPasswordExpire).toBeUndefined();
    });
    
    it('should return 400 for invalid token', async () => {
      const res = await request(server.app)
        .put('/api/auth/reset-password/invalid-token')
        .send({
          password: 'NewSecurePass123!',
          confirmPassword: 'NewSecurePass123!'
        })
        .expect(400);
      
      expect(res.body).toHaveProperty('status', 'error');
      expect(res.body).toHaveProperty('message', 'Invalid or expired token');
    });
    
    it('should return 400 for password mismatch', async () => {
      const res = await request(server.app)
        .put(`/api/auth/reset-password/${resetToken}`)
        .send({
          password: 'NewSecurePass123!',
          confirmPassword: 'MismatchedPassword'
        })
        .expect(400);
      
      expect(res.body).toHaveProperty('status', 'error');
      expect(res.body).toHaveProperty('message', 'Passwords do not match');
    });
    
    it('should return 400 for weak password', async () => {
      const res = await request(server.app)
        .put(`/api/auth/reset-password/${resetToken}`)
        .send({
          password: 'weak',
          confirmPassword: 'weak'
        })
        .expect(400);
      
      expect(res.body).toHaveProperty('status', 'error');
      expect(res.body).toHaveProperty('message', 'Password does not meet requirements');
      expect(res.body).toHaveProperty('issues');
      expect(Array.isArray(res.body.issues)).toBe(true);
    });
  });
  
  describe('GET /api/auth/verify-email/:token', () => {
    let verificationToken;
    
    beforeEach(async () => {
      // Create an unverified user with verification token
      verificationToken = crypto.randomBytes(20).toString('hex');
      const unverifiedUser = new User({
        username: 'unverifieduser',
        email: 'unverified@example.com',
        password: 'Test123!',
        isVerified: false,
        emailVerificationToken: verificationToken,
        emailVerificationExpire: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
      });
      await unverifiedUser.save();
    });
    
    it('should verify email with a valid token', async () => {
      const userBefore = await User.findOne({ email: 'unverified@example.com' });
      expect(userBefore.isVerified).toBe(false);
      
      const res = await request(server.app)
        .get(`/api/auth/verify-email/${verificationToken}`)
        .expect(200);
      
      expect(res.body).toHaveProperty('status', 'success');
      expect(res.body).toHaveProperty('message', 'Email verified successfully');
      
      // Verify the user is now marked as verified
      const userAfter = await User.findOne({ email: 'unverified@example.com' });
      expect(userAfter.isVerified).toBe(true);
      expect(userAfter.emailVerificationToken).toBeUndefined();
      expect(userAfter.emailVerificationExpire).toBeUndefined();
    });
    
    it('should return 400 for invalid token', async () => {
      const res = await request(server.app)
        .get('/api/auth/verify-email/invalid-token')
        .expect(400);
      
      expect(res.body).toHaveProperty('status', 'error');
      expect(res.body).toHaveProperty('message', 'Invalid or expired verification token');
    });
    
    it('should return 400 for already verified email', async () => {
      // Verify the user first
      await User.findOneAndUpdate(
        { email: 'unverified@example.com' },
        { isVerified: true }
      );
      
      const res = await request(server.app)
        .get(`/api/auth/verify-email/${verificationToken}`)
        .expect(400);
      
      expect(res.body).toHaveProperty('status', 'error');
      expect(res.body).toHaveProperty('message', 'Email already verified');
    });
  });
});
