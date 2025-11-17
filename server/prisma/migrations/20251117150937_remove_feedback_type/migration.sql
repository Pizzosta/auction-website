/*
  Warnings:

  - You are about to drop the column `type` on the `Feedback` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[auctionId,fromUserId]` on the table `Feedback` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Feedback_auctionId_fromUserId_type_key";

-- DropIndex
DROP INDEX "Feedback_toUserId_rating_type_idx";

-- DropIndex
DROP INDEX "Feedback_toUserId_type_idx";

-- DropIndex
DROP INDEX "Feedback_type_idx";

-- AlterTable
ALTER TABLE "Feedback" DROP COLUMN "type";

-- CreateIndex
CREATE INDEX "Feedback_toUserId_rating_idx" ON "Feedback"("toUserId", "rating");

-- CreateIndex
CREATE UNIQUE INDEX "Feedback_auctionId_fromUserId_key" ON "Feedback"("auctionId", "fromUserId");
