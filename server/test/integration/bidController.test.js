import { describe, it, before, after, beforeEach } from 'mocha';
import { expect } from 'chai';
import request from 'supertest';
import mongoose from 'mongoose';
import { createTestServer } from '../testServer.js';
import Bid from '../../src/models/Bid.js';
import {
  connectDB,
  closeDB,
  clearDB,
  createTestUser,
  createTe        const { token } = await createTestUser({tAuction,
  createTestBid,
  testUser as testUserData,
} from '../testHelpers.js';

let server;
let testUser;
let testAuction;
let authToken;

// Setup and teardown
before(async () => {
  await connectDB();
  await clearDB();
  
  // Create a test user
  const userData = await createTestUser(testUserData);
  testUser = userData.user;
  authToken = userData.token;
  
  // Create a test auction
  testAuction = await createTestAuction({ seller: testUser._id });
  
  // Start test server
  server = await createTestServer();
});

after(async () => {
  if (server) {
    await server.stop();
  }
  await closeDB();
});

describe('Bid Controller', () => {
  describe('GET /api/auctions/:auctionId/bids', () => {
    it('should return a list of bids for an auction with pagination', async () => {
      // Create more test bids
      const { user: user2 } = await createTestUser({
        username: 'bidder2',
        email: 'bidder2@example.com',
      });      await createTestBid({
        auction: testAuction._id,
        bidder: user2._id,
        amount: 200
      });
      
      const res = await request(server.app)
        .get(`/api/auctions/${testAuction._id}/bids`)
        .query({ page: 1, limit: 5, sort: '-amount' })
        .expect(200);
      
      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('pagination');
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].amount).toBeGreaterThanOrEqual(res.body.data[1].amount);
    });

    it('should return 404 for non-existent auction', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      await request(server.app)
        .get(`/api/auctions/${nonExistentId}/bids`)
        .expect(404);
    });
  });

  describe('GET /api/bids/my-bids', () => {
    it("should return the current user's bids", async () => {
      const res = await request(server.app)
        .get('/api/bids/my-bids')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ status: 'active' })
        .expect(200);
      
      expect(res.body).to.have.property('data');
      expect(
        res.body.data.some(
          bid => bid.bidder._id === testUser._id.toString() && bid.status === 'active',
        ),
      ).to.be.true;
    });

    it('should filter bids by status', async () => {
      // Create a won bid
      const wonAuction = await createTestAuction({
        status: 'ended',
        winner: testUser._id,
        currentPrice: 200,
      });
      
      await createTestBid({
        auction: wonAuction._id,
        bidder: testUser._id,
        amount: 200,
        status: 'won',
      });
      
      const res = await request(server.app)
        .get('/api/bids/my-bids')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ status: 'won' })
        .expect(200);
      
      expect(res.body.data.every(bid => bid.status === 'won')).to.be.true;
    });
  });

  describe('POST /api/auctions/:auctionId/bids', () => {
    it('should create a new bid', async () => {
      const { user: seller } = await createTestUser({
        username: 'seller2',
        email: 'seller2@example.com',
      });

      const newAuction = await createTestAuction({
        seller: seller._id,
        currentPrice: 100,
      });
      
      const bidData = {
        amount: 150,
      };
      
      const res = await request(server.app)
        .post(`/api/auctions/${newAuction._id}/bids`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(bidData)
        .expect(201);
      
      expect(res.body).to.have.property('_id');
      expect(res.body).to.have.property('amount', bidData.amount);
      expect(res.body).to.have.property('bidder', testUser._id.toString());
      expect(res.body).to.have.property('auction', newAuction._id.toString());
      
      // Verify the auction's current price was updated
      const updatedAuction = await request(server.app)
        .get(`/api/auctions/${newAuction._id}`)
        .expect(200);
      
      expect(updatedAuction.body.currentPrice).toBe(bidData.amount);
    });

    it('should return 400 for bid amount less than current price', async () => {
      const { user: seller } = await createTestUser({
        username: 'seller3',
        email: 'seller3@example.com',
      });

      const auction = await createTestAuction({
        seller: seller._id,
        currentPrice: 200,
      });
      
      const res = await request(server.app)
        .post(`/api/auctions/${auction._id}/bids`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ amount: 150 })
        .expect(400);
      
      expect(res.body).to.have.property(
        'message',
        'Bid amount must be higher than current price',
      );
    });

    it('should return 400 for bidding on own auction', async () => {
      const res = await request(server.app)
        .post(`/api/auctions/${testAuction._id}/bids`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ amount: 200 })
        .expect(400);
      
      expect(res.body).toHaveProperty('message', 'You cannot bid on your own auction');
    });
  });

  describe('PUT /api/bids/:id/retract', () => {
    it('should retract a bid', async () => {
      const { user: seller } = await createTestUser({
        username: 'seller4',
        email: 'seller4@example.com',
      });

      const auction = await createTestAuction({
        seller: seller._id,
        currentPrice: 100,
      });
      
      const bid = await createTestBid({
        auction: auction._id,
        bidder: testUser._id,
        amount: 150,
        status: 'active',
      });
      
      const res = await request(server.app)
        .put(`/api/bids/${bid._id}/retract`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(res.body).to.have.property('status', 'retracted');
      
      // Verify the bid was actually updated
      const updatedBid = await request(server.app)
        .get(`/api/bids/${bid._id}`)
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(updatedBid.body).to.have.property('status', 'retracted');
    });

    it('should return 403 if user is not the bidder', async () => {
      const { token: otherUserToken } = await createTestUser({
        username: 'bidder3',
        email: 'bidder3@example.com',
      });

      const bid = await createTestBid({
        auction: testAuction._id,
        bidder: testUser._id,
        amount: 250,
        status: 'active',
      });
      
      await request(server.app)
        .put(`/api/bids/${bid._id}/retract`)
        .set('Authorization', `Bearer ${otherUserToken}`)
        .expect(403);
    });
  });

  describe('DELETE /api/bids/:bidId', () => {
    let testBid;
    let adminUser;
    let adminToken;

    beforeEach(async () => {
      // Create an admin user
      const adminData = await createTestUser({
        username: 'admin',
        email: 'admin@example.com',
        role: 'admin',
      });
      adminUser = adminData.user;
      adminToken = adminData.token;

      // Create a test bid
      testBid = await createTestBid({
        auction: testAuction._id,
        bidder: testUser._id,
        amount: 300,
      });
    });

    it('should soft delete a bid', async () => {
      const res = await request(server.app)
        .delete(`/api/bids/${testBid._id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('success', true);
      expect(res.body.message).toContain('soft deleted');

      // Verify the bid is soft deleted
      const bid = await Bid.findById(testBid._id);
      expect(bid.isDeleted).toBe(true);
      expect(bid.deletedAt).toBeInstanceOf(Date);
      expect(bid.deletedBy.toString()).toBe(testUser._id.toString());
    });

    it('should permanently delete a bid as admin', async () => {
      const res = await request(server.app)
        .delete(`/api/bids/${testBid._id}?permanent=true`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('success', true);
      expect(res.body.message).toContain('permanently deleted');

      // Verify the bid is permanently deleted
      const bid = await Bid.findWithDeleted({ _id: testBid._id });
      expect(bid).toBeNull();
    });

    it('should not allow non-admin to permanently delete', async () => {
      const res = await request(server.app)
        .delete(`/api/bids/${testBid._id}?permanent=true`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(403);

      expect(res.body.message).toContain('Only admins can permanently delete');
    });

    it('should not allow deleting bids on active auctions', async () => {
      const activeAuction = await createTestAuction({
        seller: adminUser._id,
        status: 'active',
      });

      const activeBid = await createTestBid({
        auction: activeAuction._id,
        bidder: testUser._id,
        amount: 200,
      });

      const res = await request(server.app)
        .delete(`/api/bids/${activeBid._id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(res.body.message).toContain('Cannot delete bids on active auctions');
    });
  });

  describe('POST /api/bids/:bidId/restore', () => {
    let deletedBid;
    let adminToken;

    beforeEach(async () => {
      // Create an admin user
      const { token } = await createTestUser({
        username: 'admin2',
        email: 'admin2@example.com',
        role: 'admin',
      });
      adminToken = token;

      // Create and soft delete a test bid
      deletedBid = await createTestBid({
        auction: testAuction._id,
        bidder: testUser._id,
        amount: 400,
      });
      await deletedBid.softDelete(testUser._id);
    });

    it('should restore a soft-deleted bid as admin', async () => {
      const res = await request(server.app)
        .post(`/api/bids/${deletedBid._id}/restore`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('success', true);
      expect(res.body.message).toContain('restored successfully');

      // Verify the bid is restored
      const bid = await Bid.findById(deletedBid._id);
      expect(bid.isDeleted).toBe(false);
      expect(bid.deletedAt).toBeNull();
      expect(bid.deletedBy).toBeNull();
    });

    it('should not allow non-admin to restore bids', async () => {
      const res = await request(server.app)
        .post(`/api/bids/${deletedBid._id}/restore`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(403);

      expect(res.body.message).toContain('Only admins can restore');
    });

    it('should return 400 if bid is not deleted', async () => {
      const activeBid = await createTestBid({
        auction: testAuction._id,
        bidder: testUser._id,
        amount: 500,
      });

      const res = await request(server.app)
        .post(`/api/bids/${activeBid._id}/restore`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(res.body.message).toContain('Bid is not deleted');
    });
  });
});
