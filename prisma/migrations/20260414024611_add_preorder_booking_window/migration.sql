-- AlterTable
ALTER TABLE "product_preorder_configs" ADD COLUMN     "booking_end_date" TIMESTAMP(6),
ADD COLUMN     "extension_count" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "total_slots" SET DEFAULT 50;
