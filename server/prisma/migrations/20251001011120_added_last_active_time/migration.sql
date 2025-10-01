/*
  Warnings:

  - You are about to drop the column `last_active_at` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "User" DROP COLUMN "last_active_at",
ADD COLUMN     "lastActiveAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
