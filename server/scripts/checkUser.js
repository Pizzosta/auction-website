import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

async function checkUser() {
  const prisma = new PrismaClient();
  
  try {
    const email = 'Regtest3@example.com';
    console.log(`Checking user with email: ${email}`);
    
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        firstname: true,
        lastname: true,
        role: true,
        isVerified: true,
        isDeleted: true,
        passwordHash: true
      },
    });

    if (!user) {
      console.log('❌ User not found');
      return;
    }

    console.log('\n✅ User found:');
    console.log('ID:', user.id);
    console.log('Name:', `${user.firstname} ${user.lastname}`);
    console.log('Email:', user.email);
    console.log('Role:', user.role);
    console.log('Verified:', user.isVerified ? '✅' : '❌');
    console.log('Deleted:', user.isDeleted ? '✅' : '❌');
    console.log('Password Hash:', user.passwordHash ? '***' : 'Not set');
    
  } catch (error) {
    console.error('Error checking user:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkUser();
