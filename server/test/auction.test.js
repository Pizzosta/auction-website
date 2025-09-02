import { describe, it, before, after } from 'mocha';
import { expect } from 'chai';

// Set Mocha timeout to 10 seconds
describe.timeout = 10000;
import request from 'supertest';
import mongoose from 'mongoose';
import { createTestServer } from './testServer.js';
import { 
  connectDB, 
  closeDB, 
  clearDB, 
  createTestUser, 
  createTestAuction, 
  testUser as testUserData
} from './testHelpers.js';

let server;
let testUser;
let authToken;
let testAuction;

// Setup and teardown
before(async function() {
  // Set timeout for this hook to 10 seconds
  this.timeout(10000);
  
  try {
    await connectDB();
    await clearDB();
    
    // Create a test user and get auth token
    const userData = await createTestUser(testUserData);
    testUser = userData.user;
    authToken = userData.token;
    
    console.log('Creating test server...');
    server = await createTestServer();
    console.log('Test server created');
    
    // Create a test auction
    console.log('Creating test auction...');
    testAuction = await createTestAuction({ seller: testUser._id });
    console.log('Test auction created:', testAuction._id);
  } catch (error) {
    console.error('Error in before hook:', error);
    throw error;
  }
});

after(async function() {
  this.timeout(5000);
  try {
    if (server) {
      console.log('Stopping test server...');
      await server.stop();
      console.log('Test server stopped');
    }
    await closeDB();
  } catch (error) {
    console.error('Error in after hook:', error);
    throw error;
  }
});

describe('Auction API', function() {
  // Set timeout for all tests in this suite
  this.timeout(5000);

  describe('GET /api/auctions/:id', function() {
    it('should get a single auction by ID', async function() {
      try {
        console.log('Making request to get auction:', testAuction._id);
        const res = await request(server.app)
          .get(`/api/auctions/${testAuction._id}`)
          .set('Accept', 'application/json')
          .expect('Content-Type', /json/)
          .expect(200);
        
        console.log('Response received:', res.body);
        
        expect(res.body).to.have.property('_id', testAuction._id.toString());
        expect(res.body).to.have.property('title', testAuction.title);
      } catch (error) {
        console.error('Test failed:', error);
        throw error;
      }
    });
  });
});
