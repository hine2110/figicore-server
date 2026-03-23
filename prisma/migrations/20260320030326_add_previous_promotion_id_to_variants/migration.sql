-- AlterTable
ALTER TABLE "inventory_receipt_items" ADD COLUMN     "import_price" DECIMAL(15,2);

-- AlterTable
ALTER TABLE "product_promotions" ADD COLUMN     "is_flash_sale" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "product_variants" ADD COLUMN     "previous_promotion_id" INTEGER;

-- AlterTable
ALTER TABLE "system_recommendations" ADD COLUMN     "evaluated_at" TIMESTAMP(6),
ADD COLUMN     "impact_rating" VARCHAR(20),
ADD COLUMN     "is_evaluated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sales_after_action" DOUBLE PRECISION,
ADD COLUMN     "sales_before_action" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "promotion_items" (
    "item_id" SERIAL NOT NULL,
    "promotion_id" INTEGER NOT NULL,
    "variant_id" INTEGER NOT NULL,
    "flash_sale_price" DECIMAL(15,2) NOT NULL,
    "quota" INTEGER NOT NULL DEFAULT 0,
    "sold" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "promotion_items_pkey" PRIMARY KEY ("item_id")
);

-- AddForeignKey
ALTER TABLE "promotion_items" ADD CONSTRAINT "promotion_items_promotion_id_fkey" FOREIGN KEY ("promotion_id") REFERENCES "product_promotions"("promotion_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_items" ADD CONSTRAINT "promotion_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("variant_id") ON DELETE CASCADE ON UPDATE CASCADE;
