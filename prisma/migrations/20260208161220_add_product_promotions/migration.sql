/*
  Warnings:

  - You are about to drop the column `deposit_amount` on the `product_preorders` table. All the data in the column will be lost.
  - You are about to drop the column `full_price` on the `product_preorders` table. All the data in the column will be lost.
  - You are about to drop the column `max_slots` on the `product_preorders` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "product_preorders" DROP COLUMN "deposit_amount",
DROP COLUMN "full_price",
DROP COLUMN "max_slots",
ADD COLUMN     "is_active" BOOLEAN DEFAULT true,
ADD COLUMN     "policy_note" TEXT;

-- AlterTable
ALTER TABLE "product_variants" ADD COLUMN     "deposit_amount" DECIMAL(15,2),
ADD COLUMN     "preorder_slot_limit" INTEGER DEFAULT 0;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "product_promotion_id" INTEGER;

-- CreateTable
CREATE TABLE "product_promotions" (
    "promotion_id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "type_code" VARCHAR(50) NOT NULL,
    "value" DECIMAL(15,2) NOT NULL,
    "start_date" TIMESTAMP(6) NOT NULL,
    "end_date" TIMESTAMP(6) NOT NULL,
    "is_active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(6),

    CONSTRAINT "product_promotions_pkey" PRIMARY KEY ("promotion_id")
);

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_product_promotion_id_fkey" FOREIGN KEY ("product_promotion_id") REFERENCES "product_promotions"("promotion_id") ON DELETE SET NULL ON UPDATE NO ACTION;
