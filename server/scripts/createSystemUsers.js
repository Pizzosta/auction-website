import mongoose from 'mongoose';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import User from '../src/models/User.js';

// Load environment variables
dotenv.config();

// System users configuration
const SYSTEM_USERS = [
  {
    firstname: 'System',
    lastname: 'Admin',
    email: process.env.ADMIN_EMAIL,
    username: process.env.ADMIN_USERNAME,
    password: process.env.ADMIN_PASSWORD,
    phone: process.env.ADMIN_PHONE,
    role: 'admin',
    isVerified: true
  },
  {
    username: 'SystemAdmin',
      email: 'test1@example.com',
      phone: '+233547654321',
      password: process.env.SYSTEM_ADMIN_PASSWORD,
      role: 'admin',
      firstname: 'System',
      lastname: 'Admin',    
      isVerified: true
  },
  {
    firstname: 'System',
    lastname: 'User',
    email: 'demo@auction.com',
    username: 'demouser',
    password: 'Demo@1234',
    phone: '+233200654321',
    role: 'user',
    isVerified: true
  },
  {
    username: 'DummyUser',
    email: 'dummy@example.com',
    phone: '+233223456780',
    password: process.env.DUMMY_USER_PASSWORD,
    role: 'user',
    firstname: 'Dummy',
    lastname: 'User',
    isVerified: true
  },
];

async function createSystemUsers() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);

    console.log('Connected to MongoDB');

    for (const userData of SYSTEM_USERS) {
      const { email } = userData;
      
      // Check if user already exists
      const existingUser = await User.findOne({ email });
      
      if (existingUser) {
        console.log(`User ${email} already exists, updating if needed...`);
        
        // Update user role if needed
        if (existingUser.role !== userData.role) {
          existingUser.role = userData.role;
          await existingUser.save();
          console.log(`Updated role for ${email} to ${userData.role}`);
        }
        continue;
      }

      // Create new user
      const user = new User({
        ...userData,
      });

      await user.save();
      console.log(`Created system user: ${email}`);
    }

    console.log('System users setup completed');
    process.exit(0);
  } catch (error) {
    console.error('Error setting up system users:', error);
    process.exit(1);
  }
}

// Run the script
createSystemUsers();
