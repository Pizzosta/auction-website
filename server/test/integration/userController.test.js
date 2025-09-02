import { describe, it, before, after, beforeEach, afterEach } from 'mocha';
import request from 'supertest';
import mongoose from 'mongoose';
import { createTestServer } from '../testServer.js';
import { 
  connectDB, 
  closeDB, 
  clearDB, 
  createTestUser, 
  createTestAuction,
  testUser as testUserData
} from '../testHelpers.js';

let server;
let testUser;
let adminUser;
let authToken;
let adminToken;

// Setup and teardown
before(async () => {
  await connectDB();
  await clearDB();
  
  // Create test users
  const userData = await createTestUser(testUserData);
  testUser = userData.user;
  authToken = userData.token;
  
  // Create admin user
  const adminData = await createTestUser({
    ...testUserData,
    email: 'admin@example.com',
    username: 'adminuser',
    role: 'admin',
    phone: '+1234567890' // Ensure required field is provided
  });
  adminUser = adminData.user;
  adminToken = adminData.token;
  
  // Start test server
  server = await createTestServer();
});

after(async () => {
  if (server) {
    await server.stop();
  }
  await closeDB();
});

describe('User Controller', () => {
  describe('GET /api/users (Admin only)', () => {
    it('should return a list of users with pagination (Admin)', async () => {
      const res = await request(server.app)
        .get('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ page: 1, limit: 10 })
        .expect(200);
      
      expect(res.body).toHaveProperty('status', 'success');
      expect(res.body).toHaveProperty('data.users');
      expect(res.body).toHaveProperty('pagination');
      expect(Array.isArray(res.body.data.users)).toBe(true);
      expect(res.body.data.users.length).toBeGreaterThan(0);
    });

    it('should filter users by role', async () => {
      const res = await request(server.app)
        .get('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ role: 'user' })
        .expect(200);
      
      expect(res.body.data.users.every(user => user.role === 'user')).toBe(true);
    });

    it('should search users by name, email, or username', async () => {
      const searchTerm = 'regular';
      const res = await request(server.app)
        .get('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ search: searchTerm })
        .expect(200);
      
      const user = res.body.data.users[0];
      expect(
        user.username.includes(searchTerm) || 
        user.email.includes(searchTerm)
      ).toBe(true);
    });

    it('should return 403 for non-admin users', async () => {
      await request(server.app)
        .get('/api/users')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(403);
    });
  });

  describe('GET /api/users/me', () => {
    it('should return the current user profile', async () => {
      const res = await request(server.app)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(res.body).toHaveProperty('_id', testUser._id.toString());
      expect(res.body).not.toHaveProperty('password');
    });

    it('should return 401 if not authenticated', async () => {
      await request(server.app)
        .get('/api/users/me')
        .expect(401);
    });
  });

  describe('PATCH /api/users/:id', () => {
    it('should update a user (Admin)', async () => {
      const updates = {
        username: 'updatedusername',
        email: 'updated@example.com',
        phone: '1234567890'
      };
      
      const res = await request(server.app)
        .patch(`/api/users/${testUser._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updates)
        .expect(200);
      
      expect(res.body).toHaveProperty('username', updates.username);
      expect(res.body).toHaveProperty('email', updates.email);
      expect(res.body).toHaveProperty('phone', updates.phone);
    });

    it('should allow users to update their own profile', async () => {
      const updates = {
        firstname: 'Updated',
        lastname: 'User',
        phone: '0987654321'
      };
      
      const res = await request(server.app)
        .patch(`/api/users/${testUser._id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updates)
        .expect(200);
      
      expect(res.body).toHaveProperty('firstname', updates.firstname);
      expect(res.body).toHaveProperty('lastname', updates.lastname);
      expect(res.body).toHaveProperty('phone', updates.phone);
    });

    it('should not allow users to update other users', async () => {
      const otherUser = await createTestUser({
        username: 'otheruser',
        email: 'other@example.com'
      });
      
      await request(app)
        .patch(`/api/users/${otherUser.user._id}`)
        .set('Authorization', `Bearer ${regularToken}`)
        .send({ username: 'hacked' })
        .expect(403);
    });
  });

  describe('DELETE /api/users/:id', () => {
    it('should delete a user (Admin)', async () => {
      const userToDelete = await createTestUser({
        username: 'tobedeleted',
        email: 'delete@example.com'
      });
      
      await request(app)
        .delete(`/api/users/${userToDelete.user._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ password: 'Test123!' }) // Admin's password
        .expect(200);
      
      // Verify the user was deleted
      const deletedUser = await mongoose.model('User').findById(userToDelete.user._id);
      expect(deletedUser).toBeNull();
    });

    it('should allow users to delete their own account', async () => {
      const { user, token } = await createTestUser({
        username: 'selfdeleter',
        email: 'selfdelete@example.com'
      });
      
      await request(app)
        .delete(`/api/users/${user._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ password: 'Test123!' })
        .expect(200);
    });

    it('should not allow users to delete other users', async () => {
      const otherUser = await createTestUser({
        username: 'otherusertodelete',
        email: 'otherdelete@example.com'
      });
      
      await request(app)
        .delete(`/api/users/${otherUser.user._id}`)
        .set('Authorization', `Bearer ${regularToken}`)
        .send({ password: 'Test123!' })
        .expect(403);
    });
  });

  describe('Profile Picture Upload', () => {
    it('should upload a profile picture', async () => {
      // Mock file upload
      await request(app)
        .post('/api/users/me/upload-picture')
        .set('Authorization', `Bearer ${regularToken}`)
        .attach('profilePicture', 'test/fixtures/test-avatar.jpg')
        .expect(200);
      
      // Verify the user's profile picture was updated
      const updatedUser = await mongoose.model('User').findById(regularUser._id);
      expect(updatedUser.avatarUrl).toBeDefined();
      expect(updatedUser.avatarUrl).toContain('cloudinary.com');
    });

    it('should delete a profile picture', async () => {
      // First upload a picture
      await request(app)
        .post('/api/users/me/upload-picture')
        .set('Authorization', `Bearer ${regularToken}`)
        .attach('profilePicture', 'test/fixtures/test-avatar.jpg');
      
      // Then delete it
      await request(app)
        .delete('/api/users/me/remove-picture')
        .set('Authorization', `Bearer ${regularToken}`)
        .expect(200);
      
      // Verify the user's profile picture was removed
      const updatedUser = await mongoose.model('User').findById(regularUser._id);
      expect(updatedUser.avatarUrl).toBeUndefined();
    });
  });
});
