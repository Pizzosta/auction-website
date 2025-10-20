-- AlterTable
ALTER TABLE "FeaturedAuction" ADD COLUMN     "restoredAt" TIMESTAMP(3),
ADD COLUMN     "restoredById" TEXT;

-- CreateIndex
CREATE INDEX "Auction_category_idx" ON "Auction"("category");

-- CreateIndex
CREATE INDEX "Auction_startDate_idx" ON "Auction"("startDate");

-- CreateIndex
CREATE INDEX "Auction_status_endDate_idx" ON "Auction"("status", "endDate");

-- CreateIndex
CREATE INDEX "Auction_currentPrice_idx" ON "Auction"("currentPrice");

-- CreateIndex
CREATE INDEX "Auction_isDeleted_status_idx" ON "Auction"("isDeleted", "status");

-- CreateIndex
CREATE INDEX "Auction_sellerId_status_createdAt_idx" ON "Auction"("sellerId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Bid_amount_idx" ON "Bid"("amount");

-- CreateIndex
CREATE INDEX "Bid_isOutbid_idx" ON "Bid"("isOutbid");

-- CreateIndex
CREATE INDEX "Bid_createdAt_idx" ON "Bid"("createdAt");

-- CreateIndex
CREATE INDEX "Bid_auctionId_isOutbid_idx" ON "Bid"("auctionId", "isOutbid");

-- CreateIndex
CREATE INDEX "Bid_auctionId_createdAt_amount_idx" ON "Bid"("auctionId", "createdAt", "amount");

-- CreateIndex
CREATE INDEX "FeaturedAuction_restoredById_idx" ON "FeaturedAuction"("restoredById");

-- CreateIndex
CREATE INDEX "FeaturedAuction_isDeleted_idx" ON "FeaturedAuction"("isDeleted");

-- CreateIndex
CREATE INDEX "FeaturedAuction_createdAt_idx" ON "FeaturedAuction"("createdAt");

-- CreateIndex
CREATE INDEX "Feedback_rating_idx" ON "Feedback"("rating");

-- CreateIndex
CREATE INDEX "Feedback_type_idx" ON "Feedback"("type");

-- CreateIndex
CREATE INDEX "Feedback_createdAt_idx" ON "Feedback"("createdAt");

-- CreateIndex
CREATE INDEX "Feedback_toUserId_type_idx" ON "Feedback"("toUserId", "type");

-- CreateIndex
CREATE INDEX "Feedback_toUserId_rating_type_idx" ON "Feedback"("toUserId", "rating", "type");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_username_idx" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_firstname_idx" ON "User"("firstname");

-- CreateIndex
CREATE INDEX "User_phone_idx" ON "User"("phone");

-- CreateIndex
CREATE INDEX "User_isVerified_idx" ON "User"("isVerified");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_isDeleted_idx" ON "User"("isDeleted");

-- CreateIndex
CREATE INDEX "User_lastActiveAt_idx" ON "User"("lastActiveAt");

-- CreateIndex
CREATE INDEX "User_role_isDeleted_createdAt_idx" ON "User"("role", "isDeleted", "createdAt");

-- CreateIndex
CREATE INDEX "Watchlist_createdAt_idx" ON "Watchlist"("createdAt");

-- CreateIndex
CREATE INDEX "Watchlist_userId_isDeleted_idx" ON "Watchlist"("userId", "isDeleted");

-- AddForeignKey
ALTER TABLE "FeaturedAuction" ADD CONSTRAINT "FeaturedAuction_restoredById_fkey" FOREIGN KEY ("restoredById") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
