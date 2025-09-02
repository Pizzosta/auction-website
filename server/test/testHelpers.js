import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import User from '../src/models/User.js';
import Auction from '../src/models/Auction.js';
import Bid from '../src/models/Bid.js';

export const testUser = {
  username: 'testuser',
  email: 'test@example.com',
  password: 'Test123!',
  firstname: 'Test',
  lastname: 'User',
  phone: '+233541234567', // Valid Ghanaian phone number with country code
  role: 'user',
  isVerified: true
};

let mongoServer;

/**
 * Connect to the in-memory database.
 */
const connectDB = async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  
  // Close any existing connections first
  if (mongoose.connection.readyState !== 0) { // 0 = disconnected
    await mongoose.disconnect();
  }
  
  await mongoose.connect(uri);
};

/**
 * Drop database, close the connection and stop mongod.
 */
const closeDB = async () => {
  if (mongoServer) {
    await mongoose.disconnect();
    await mongoServer.stop();
  }
};

/**
 * Remove all the data for all db collections.
 */
const clearDB = async () => {
  if (mongoose.connection.readyState === 0) return; // Skip if not connected
  
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    const collection = collections[key];
    await collection.deleteMany({});
  }
};

// Create a test user and get auth token
const createTestUser = async (userData = {}) => {
  const user = new User({
    ...testUser,
    ...userData,
    isVerified: true
  });
  await user.save();
  
  const token = jwt.sign(
    { userId: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
  
  return { user, token };
};

// Create a test auction
const createTestAuction = async (auctionData = {}, sellerId) => {
  const seller = sellerId || (await createTestUser())._id;
  
  const auction = new Auction({
    title: 'Test Auction',
    description: 'This is a test auction',
    startingPrice: 100,
    seller,
    category: 'Electronics', 
    endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), 
    images: [{
      url: 'https://example.com/image.jpg',
      publicId: 'test_public_id',
      isPrimary: true
    }],
    ...auctionData
  });
  
  return await auction.save();
};

// Create a test bid
const createTestBid = async (bidData = {}) => {
  const auction = bidData.auction || (await createTestAuction())._id;
  const bidder = bidData.bidder || (await createTestUser()).user._id;
  
  const bid = new Bid({
    amount: bidData.amount || 150,
    auction,
    bidder,
    status: 'active',
    ...bidData
  });
  
  return await bid.save();
};

export {
  connectDB,
  closeDB,
  clearDB,
  createTestUser,
  createTestAuction,
  createTestBid
};

