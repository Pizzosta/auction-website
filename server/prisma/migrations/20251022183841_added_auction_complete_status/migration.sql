-- AlterEnum
ALTER TYPE "AuctionStatus" ADD VALUE 'completed';

-- AlterTable
ALTER TABLE "Auction" ADD COLUMN     "deliveryConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "deliveryConfirmedByUserId" TEXT,
ADD COLUMN     "isDeliveryConfirmed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isPaymentConfirmed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "paymentConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "paymentConfirmedByUserId" TEXT;

-- AlterTable
ALTER TABLE "Feedback" ALTER COLUMN "toUserId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Auction_isPaymentConfirmed_idx" ON "Auction"("isPaymentConfirmed");

-- CreateIndex
CREATE INDEX "Auction_isDeliveryConfirmed_idx" ON "Auction"("isDeliveryConfirmed");

-- CreateIndex
CREATE INDEX "Auction_paymentConfirmedByUserId_idx" ON "Auction"("paymentConfirmedByUserId");

-- CreateIndex
CREATE INDEX "Auction_deliveryConfirmedByUserId_idx" ON "Auction"("deliveryConfirmedByUserId");

-- AddForeignKey
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_paymentConfirmedByUserId_fkey" FOREIGN KEY ("paymentConfirmedByUserId") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_deliveryConfirmedByUserId_fkey" FOREIGN KEY ("deliveryConfirmedByUserId") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
