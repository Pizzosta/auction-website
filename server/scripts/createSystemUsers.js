import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

// Load environment variables
dotenv.config();

const prisma = new PrismaClient();

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
    password: process.env.SYSTEM_ADMIN_PASSWORD || 'System@1234',
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
    firstname: 'Reg',
    lastname: 'Test',
    email: 'Regtest3@example.com',
    username: 'Reg',
    phone: '233500000001',
    password: 'Regtest3@example.com',
    role: 'user',
    isVerified: true
  },
  {
    username: 'DummyUser',
    email: 'dummy@example.com',
    phone: '+233223456780',
    password: process.env.DUMMY_USER_PASSWORD || 'Dummy@1234',
    role: 'user',
    firstname: 'Dummy',
    lastname: 'User',
    isVerified: true
  },
];

async function hashPassword(password) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

async function createSystemUsers() {
  try {
    console.log('Connecting to database...');

    for (const userData of SYSTEM_USERS) {
      const { password, ...userDataWithoutPassword } = userData; // Don't destructure email here
      const passwordHash = await hashPassword(password);

      try {
        // Check if user exists
        const existingUser = await prisma.user.findUnique({
          where: { email: userData.email }
        });

        if (existingUser) {
          console.log(`User ${userData.email} already exists, updating if needed...`);

          // Update user role if needed
          if (existingUser.role !== userData.role) {
            await prisma.user.update({
              where: { id: existingUser.id },
              data: { role: userData.role }
            });
            console.log(`Updated role for ${userData.email} to ${userData.role}`);
          }
          continue;
        }

        // Create new user
        await prisma.user.create({
          data: {
            ...userDataWithoutPassword, // This now includes email
            passwordHash,
            phone: userData.phone.startsWith('+') ? userData.phone : `+${userData.phone}`
          }
        });

        console.log(`Created system user: ${userData.email}`);
      } catch (error) {
        console.error(`Error processing user ${userData.email}:`, error);
      }
    }

    console.log('System users setup completed');
  } catch (error) {
    console.error('Error setting up system users:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

// Run the script
createSystemUsers();