-- CreateTable
CREATE TABLE "FeaturedAuction" (
    "id" TEXT NOT NULL,
    "auctionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "addedById" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "FeaturedAuction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FeaturedAuction_auctionId_key" ON "FeaturedAuction"("auctionId");

-- CreateIndex
CREATE INDEX "FeaturedAuction_addedById_idx" ON "FeaturedAuction"("addedById");

-- AddForeignKey
ALTER TABLE "FeaturedAuction" ADD CONSTRAINT "FeaturedAuction_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeaturedAuction" ADD CONSTRAINT "FeaturedAuction_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
