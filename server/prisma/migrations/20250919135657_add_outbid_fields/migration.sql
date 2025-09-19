-- AlterTable
ALTER TABLE "Bid" ADD COLUMN     "isOutbid" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "outbidAt" TIMESTAMP(3);
