-- DropIndex
DROP INDEX "idx_market_intel_status";

-- DropIndex
DROP INDEX "idx_market_intel_unique";

-- AlterTable
ALTER TABLE "market_intel" ALTER COLUMN "source_url" SET DATA TYPE TEXT;

-- CreateIndex
CREATE INDEX "idx_market_intel_scanned_at" ON "market_intel"("scanned_at");
