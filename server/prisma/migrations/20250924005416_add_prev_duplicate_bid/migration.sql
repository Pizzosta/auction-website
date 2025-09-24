/*
  Warnings:

  - A unique constraint covering the columns `[auctionId,bidderId,amount]` on the table `Bid` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Bid_auctionId_bidderId_amount_key" ON "Bid"("auctionId", "bidderId", "amount");
