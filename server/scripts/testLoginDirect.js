import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

async function testLoginDirect() {
  const prisma = new PrismaClient();
  
  try {
    const email = 'Regtest3@example.com';
    const password = 'Regtest3@example.com';
    
    console.log(`Testing direct login for: ${email}`);
    
    // 1. Find the user
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        firstname: true,
        lastname: true,
        role: true,
        isVerified: true,
        isDeleted: true
      },
    });

    if (!user) {
      console.error('❌ User not found');
      return;
    }

    console.log('\n✅ User found:', {
      id: user.id,
      email: user.email,
      name: `${user.firstname} ${user.lastname}`,
      role: user.role,
      isVerified: user.isVerified,
      isDeleted: user.isDeleted
    });

    // 2. Verify password
    const isMatch = user.passwordHash 
      ? await bcrypt.compare(password, user.passwordHash)
      : false;

    if (!isMatch) {
      console.error('❌ Password does not match');
      return;
    }

    console.log('✅ Password verified successfully');
    
    // 3. Simulate token generation (using the same logic as in your auth controller)
    if (user.isDeleted) {
      console.error('❌ Account is deactivated');
      return;
    }

    if (!user.isVerified) {
      console.error('❌ Account is not verified');
      return;
    }

    console.log('\n🎉 Login would be successful!');
    console.log('User role:', user.role);
    
  } catch (error) {
    console.error('Error during direct login test:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testLoginDirect();
