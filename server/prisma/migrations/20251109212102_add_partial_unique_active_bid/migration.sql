-- NOTE: partial unique index "Bid_auctionId_bidderId_amount_active_key"
-- guarantees uniqueness only for isDeleted = false

-- CreateIndex
CREATE UNIQUE INDEX "Bid_auctionId_bidderId_amount_active_key" 
ON "Bid"("auctionId", "bidderId", "amount") 
WHERE "isDeleted" = false;