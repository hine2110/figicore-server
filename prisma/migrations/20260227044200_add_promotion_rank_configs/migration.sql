-- AlterTable
ALTER TABLE "promotions" ADD COLUMN     "apply_rank_code" VARCHAR(50),
ADD COLUMN     "collected_quantity" INTEGER DEFAULT 0,
ADD COLUMN     "is_public" BOOLEAN DEFAULT true,
ADD COLUMN     "max_quantity" INTEGER;
