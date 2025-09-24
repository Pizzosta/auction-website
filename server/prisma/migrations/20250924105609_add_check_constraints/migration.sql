-- This is an empty migration.
ALTER TABLE "Auction"
ADD CONSTRAINT current_price_check CHECK ("currentPrice" >= "startingPrice");

ALTER TABLE "Auction"
ADD CONSTRAINT end_date_check CHECK ("endDate" > "startDate");
