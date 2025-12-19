/*
  Warnings:

  - Added the required column `location` to the `Auction` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Auction" ADD COLUMN     "location" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "Auction_location_idx" ON "Auction"("location");
