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
let authToken;

// Test data
let testAuction;

// Setup and teardown
before(async () => {
  // Connect to the test database
  await connectDB();
  await clearDB();
  
  // Create a test user and get auth token
  const userData = await createTestUser(testUserData);
  testUser = userData.user;
  authToken = userData.token;
  
  // Create and start the test server
  server = await createTestServer();
  
  // Create a test auction
  testAuction = await createTestAuction({ seller: testUser._id });
});

after(async () => {
  if (server) {
    await server.stop();
  }
  await closeDB();
});

afterEach(async () => {
  await clearDB();
});

// Helper function to make authenticated requests
const authedRequest = (method, url) => {
  return request(server)[method](url)
    .set('Authorization', `Bearer ${authToken}`);
};

describe('Auction Controller', () => {
  describe('GET /api/auctions', () => {
    it('should return a list of auctions with pagination', async () => {
      // Create some test auctions
      await createTestAuction({ title: 'Auction 1' });
      await createTestAuction({ title: 'Auction 2' });
      
      const res = await authedRequest('get', '/api/auctions')
        .query({ page: 1, limit: 2 })
        .expect('Content-Type', /json/)
        .expect(200);
      
      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('pagination');
      expect(res.body.data).toHaveLength(3); // 1 from beforeAll + 2 new ones
      expect(res.body.pagination).toHaveProperty('total', 3);
      expect(res.body.pagination).toHaveProperty('page', 1);
      expect(res.body.pagination).toHaveProperty('limit', 2);
      expect(res.body.pagination).toHaveProperty('totalPages', 2);
    });

    it('should filter auctions by status', async () => {
      const res = await request(server.app)
        .get('/api/auctions')
        .query({ status: 'active' })
        .expect(200);
      
      expect(res.body.data.every(auction => auction.status === 'active')).toBe(true);
    });

    it('should filter auctions by price range', async () => {
      await createTestAuction({ startingPrice: 50, currentPrice: 50 });
      await createTestAuction({ startingPrice: 200, currentPrice: 200 });
      
      const res = await request(server.app)
        .get('/api/auctions')
        .query({ minPrice: 100, maxPrice: 150 })
        .expect(200);
      
      expect(res.body.data.every(auction => 
        auction.currentPrice >= 100 && auction.currentPrice <= 150
      )).toBe(true);
    });

    it('should return auctions ending soon', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      await createTestAuction({ 
        endTime: tomorrow,
        status: 'active'
      });
      
      const res = await request(server.app)
        .get('/api/auctions')
        .query({ endingSoon: 'true' })
        .expect(200);
      
      expect(res.body.data.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/auctions/:id', () => {
    it('should return a single auction', async () => {
      const res = await request(server.app)
        .get(`/api/auctions/${testAuction._id}`)
        .expect(200);
      
      expect(res.body).toHaveProperty('_id', testAuction._id.toString());
      expect(res.body).toHaveProperty('title', testAuction.title);
    });

    it('should return 404 for non-existent auction', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      await request(server.app)
        .get(`/api/auctions/${nonExistentId}`)
        .expect(404);
    });
  });

  describe('POST /api/auctions', () => {
    it('should create a new auction', async () => {
      const newAuction = {
        title: 'New Test Auction',
        description: 'New Test Description',
        startingPrice: 200,
        endTime: new Date(Date.now() + 48 * 60 * 60 * 1000), // 2 days from now
        category: 'test'
      };
      
      const res = await request(server.app)
        .post('/api/auctions')
        .set('Authorization', `Bearer ${authToken}`)
        .send(newAuction)
        .expect(201);
      
      expect(res.body).toHaveProperty('_id');
      expect(res.body).toHaveProperty('title', newAuction.title);
      expect(res.body).toHaveProperty('seller', user._id.toString());
      expect(res.body).toHaveProperty('status', 'active');
    });

    it('should return 400 for invalid auction data', async () => {
      const invalidAuction = {
        title: '', // Invalid: empty title
        description: 'Test',
        startingPrice: -100, // Invalid: negative price
        endTime: 'invalid-date' // Invalid date format
      };
      
      const res = await request(server.app)
        .post('/api/auctions')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidAuction)
        .expect(400);
      
      expect(res.body).toHaveProperty('errors');
      expect(res.body.errors).toBeInstanceOf(Array);
    });
  });

  describe('PUT /api/auctions/:id', () => {
    it('should update an existing auction', async () => {
      const updates = {
        title: 'Updated Auction Title',
        description: 'Updated description',
        startingPrice: 250
      };
      
      const res = await request(server.app)
        .put(`/api/auctions/${testAuction._id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updates)
        .expect(200);
      
      expect(res.body).toHaveProperty('title', updates.title);
      expect(res.body).toHaveProperty('description', updates.description);
      expect(res.body).toHaveProperty('startingPrice', updates.startingPrice);
    });

    it('should return 403 if user is not the seller', async () => {
      const otherUser = await createTestUser({
        username: 'otheruser',
        email: 'other@example.com'
      });
      
      const auction = await createTestAuction({ seller: otherUser.user._id });
      
      const updates = { title: 'Unauthorized Update' };
      
      await request(server.app)
        .put(`/api/auctions/${auction._id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updates)
        .expect(403);
    });
  });

  describe('DELETE /api/auctions/:id', () => {
    it('should delete an auction', async () => {
      const auctionToDelete = await createTestAuction({ seller: testUser._id });
      
      await request(server.app)
        .delete(`/api/auctions/${auctionToDelete._id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      // Verify the auction was deleted
      await request(server.app)
        .get(`/api/auctions/${auctionToDelete._id}`)
        .expect(404);
    });
  });
});
