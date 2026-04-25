-- CreateTable
CREATE TABLE "market_intel" (
    "id" SERIAL NOT NULL,
    "brand" VARCHAR(100) NOT NULL,
    "product_name" VARCHAR(500) NOT NULL,
    "description" TEXT,
    "category" VARCHAR(100),
    "status" VARCHAR(50) NOT NULL,
    "release_date" VARCHAR(100),
    "source_url" VARCHAR(1000) NOT NULL,
    "source_title" VARCHAR(500),
    "confidence" VARCHAR(20) NOT NULL,
    "scanned_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_intel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_market_intel_brand" ON "market_intel"("brand");

-- CreateIndex
CREATE INDEX "idx_market_intel_status" ON "market_intel"("status");

-- CreateIndex
CREATE UNIQUE INDEX "idx_market_intel_unique" ON "market_intel"("brand", "product_name");
