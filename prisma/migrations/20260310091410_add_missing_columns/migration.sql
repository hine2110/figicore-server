/*
  Warnings:

  - You are about to drop the column `end_date` on the `product_promotions` table. All the data in the column will be lost.
  - You are about to drop the column `start_date` on the `product_promotions` table. All the data in the column will be lost.
  - You are about to drop the column `product_promotion_id` on the `products` table. All the data in the column will be lost.
  - Added the required column `end_time` to the `product_promotions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `start_time` to the `product_promotions` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "products" DROP CONSTRAINT "products_product_promotion_id_fkey";

-- AlterTable
ALTER TABLE "product_promotions" DROP COLUMN "end_date",
DROP COLUMN "start_date",
ADD COLUMN     "end_time" VARCHAR(5) NOT NULL,
ADD COLUMN     "is_recurring" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "start_time" VARCHAR(5) NOT NULL;

-- AlterTable
ALTER TABLE "product_variants" ADD COLUMN     "product_promotion_id" INTEGER;

-- AlterTable
ALTER TABLE "products" DROP COLUMN "product_promotion_id";

-- CreateTable
CREATE TABLE "system_recommendations" (
    "recommendation_id" SERIAL NOT NULL,
    "target_type" VARCHAR(50) NOT NULL,
    "target_id" INTEGER NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "reasoning" TEXT NOT NULL,
    "suggested_action" JSONB NOT NULL,
    "status_code" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_recommendations_pkey" PRIMARY KEY ("recommendation_id")
);

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_promotion_id_fkey" FOREIGN KEY ("product_promotion_id") REFERENCES "product_promotions"("promotion_id") ON DELETE SET NULL ON UPDATE NO ACTION;
