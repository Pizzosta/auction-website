-- CreateIndex
CREATE INDEX "Auction_isDeleted_idx" ON "Auction"("isDeleted");

-- CreateIndex
CREATE INDEX "Auction_status_startDate_idx" ON "Auction"("status", "startDate");
