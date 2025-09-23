-- Migration SQL
-- 1. First, make updatedAt nullable in the Bid table
ALTER TABLE "Bid" ALTER COLUMN "updatedAt" DROP NOT NULL;

-- 2. Add the version column to the User table with a default value of 1
ALTER TABLE "User" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

-- 3. Update existing Bid records to set updatedAt to the same value as createdAt
UPDATE "Bid" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;

-- 4. Make updatedAt required again
ALTER TABLE "Bid" ALTER COLUMN "updatedAt" SET NOT NULL;