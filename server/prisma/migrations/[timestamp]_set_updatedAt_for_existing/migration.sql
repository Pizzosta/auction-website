-- Set updatedAt to createdAt for existing records
UPDATE "Bid" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;
