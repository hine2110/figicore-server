/*
  Warnings:

  - You are about to drop the column `max_value_allow` on the `product_blindboxes` table. All the data in the column will be lost.
  - You are about to drop the column `min_value_allow` on the `product_blindboxes` table. All the data in the column will be lost.
  - You are about to drop the column `target_margin` on the `product_blindboxes` table. All the data in the column will be lost.
  - You are about to drop the column `image_url` on the `product_variants` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[name]` on the table `brands` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[name]` on the table `categories` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[name]` on the table `series` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "product_blindboxes" DROP COLUMN "max_value_allow",
DROP COLUMN "min_value_allow",
DROP COLUMN "target_margin",
ADD COLUMN     "max_value" DECIMAL(15,2),
ADD COLUMN     "min_value" DECIMAL(15,2),
ADD COLUMN     "tier_config" JSONB;

-- AlterTable
ALTER TABLE "product_preorders" ADD COLUMN     "full_price" DECIMAL(15,2) DEFAULT 0;

-- AlterTable
ALTER TABLE "product_variants" DROP COLUMN "image_url",
ADD COLUMN     "media_assets" JSONB DEFAULT '[]';

-- CreateIndex
CREATE UNIQUE INDEX "brands_name_key" ON "brands"("name");

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "series_name_key" ON "series"("name");
