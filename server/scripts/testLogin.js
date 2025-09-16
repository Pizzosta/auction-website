import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

async function testLogin() {
  const prisma = new PrismaClient();
  
  try {
    const email = 'Regtest3@example.com';
    const password = 'Regtest3@example.com';

    console.log('Testing login for:', email);
    
    // 1. Find the user
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        role: true,
        isVerified: true,
        isDeleted: false
      },
    });

    if (!user) {
      console.error('❌ User not found');
      return;
    }

    console.log('✅ User found:', { 
      email: user.email, 
      role: user.role, 
      isVerified: user.isVerified 
    });

    // 2. Verify password
    const isPasswordValid = user.passwordHash 
      ? await bcrypt.compare(password, user.passwordHash)
      : false;

    if (!isPasswordValid) {
      console.error('❌ Invalid password');
      console.log('Password hash in DB:', user.passwordHash);
      return;
    }

    console.log('✅ Password is valid');
    console.log('\n🎉 Login successful!');
    
  } catch (error) {
    console.error('Error during login test:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testLogin();
