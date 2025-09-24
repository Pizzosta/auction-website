/*
  Warnings:

  - A unique constraint covering the columns `[highestBidId]` on the table `Auction` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Auction" ADD COLUMN     "highestBidId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Auction_highestBidId_key" ON "Auction"("highestBidId");

-- AddForeignKey
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_highestBidId_fkey" FOREIGN KEY ("highestBidId") REFERENCES "Bid"("id") ON DELETE SET NULL ON UPDATE CASCADE;
