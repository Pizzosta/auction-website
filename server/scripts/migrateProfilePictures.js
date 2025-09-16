import { PrismaClient } from '@prisma/client';
import logger from '../src/utils/logger.js';

async function migrateProfilePictures() {
  const prisma = new PrismaClient();

  try {
    logger.info('Starting profile picture migration...');

    // First, check if the old columns still exist
    const oldColumnsExist = await prisma.$queryRaw`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'User' 
      AND column_name IN ('profilePictureUrl', 'profilePictureId')
    `;

    if (oldColumnsExist.length === 0) {
      logger.info('Old profile picture columns do not exist. Migration not needed.');
      return;
    }

    // Migrate data using raw SQL
    await prisma.$executeRaw`
      UPDATE "User"
      SET "profilePicture" = 
        CASE 
          WHEN "profilePictureUrl" IS NOT NULL AND "profilePictureId" IS NOT NULL 
          THEN jsonb_build_object(
            'url', "profilePictureUrl",
            'publicId', "profilePictureId",
            'migratedAt', NOW()
          )
          WHEN "profilePictureUrl" IS NOT NULL 
          THEN jsonb_build_object(
            'url', "profilePictureUrl",
            'publicId', '',
            'migratedAt', NOW()
          )
          WHEN "profilePictureId" IS NOT NULL
          THEN jsonb_build_object(
            'url', '',
            'publicId', "profilePictureId",
            'migratedAt', NOW()
          )
          ELSE NULL
        END
      WHERE "profilePictureUrl" IS NOT NULL OR "profilePictureId" IS NOT NULL;
    `;

    logger.info('Successfully migrated profile picture data to JSON field');

    // Drop the old columns in a separate transaction
    await prisma.$transaction([
      prisma.$executeRaw`ALTER TABLE "User" DROP COLUMN IF EXISTS "profilePictureUrl"`,
      prisma.$executeRaw`ALTER TABLE "User" DROP COLUMN IF EXISTS "profilePictureId"`
    ]);

    logger.info('Successfully removed old profile picture columns');
  } catch (error) {
    logger.error('Error during profile picture migration:', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

migrateProfilePictures().catch(console.error);
