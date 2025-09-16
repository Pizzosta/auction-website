import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

async function updateUserPassword() {
  const prisma = new PrismaClient();
  
  try {
    const email = 'Regtest3@example.com';
    const newPassword = 'Regtest3@example.com';
    
    console.log(`Updating password for user: ${email}`);
    
    // Hash the new password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);
    
    // Update the user's password
    const updatedUser = await prisma.user.update({
      where: { email },
      data: { passwordHash },
      select: {
        id: true,
        email: true,
        firstname: true,
        lastname: true,
        isVerified: true,
        isDeleted: true
      }
    });
    
    console.log('✅ Password updated successfully');
    console.log('Updated user:', updatedUser);
    
  } catch (error) {
    console.error('❌ Error updating password:', error);
  } finally {
    await prisma.$disconnect();
  }
}

updateUserPassword();
