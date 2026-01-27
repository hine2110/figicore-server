/*
  Warnings:

  - You are about to drop the column `product_id` on the `cart_items` table. All the data in the column will be lost.
  - You are about to drop the column `product_id` on the `inventory_logs` table. All the data in the column will be lost.
  - You are about to drop the column `product_id` on the `inventory_receipt_items` table. All the data in the column will be lost.
  - You are about to drop the column `product_id` on the `order_items` table. All the data in the column will be lost.
  - You are about to drop the column `margin_rate` on the `product_blindboxes` table. All the data in the column will be lost.
  - You are about to drop the column `price_config` on the `product_blindboxes` table. All the data in the column will be lost.
  - You are about to drop the column `barcode` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `price` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `sku` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `stock_available` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `stock_defect` on the `products` table. All the data in the column will be lost.
  - Added the required column `variant_id` to the `cart_items` table without a default value. This is not possible if the table is not empty.
  - Added the required column `variant_id` to the `inventory_logs` table without a default value. This is not possible if the table is not empty.
  - Added the required column `variant_id` to the `inventory_receipt_items` table without a default value. This is not possible if the table is not empty.
  - Added the required column `variant_id` to the `order_items` table without a default value. This is not possible if the table is not empty.
  - Added the required column `price` to the `product_blindboxes` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "cart_items" DROP CONSTRAINT "cart_items_product_id_fkey";

-- DropForeignKey
ALTER TABLE "inventory_logs" DROP CONSTRAINT "inventory_logs_product_id_fkey";

-- DropForeignKey
ALTER TABLE "inventory_receipt_items" DROP CONSTRAINT "inventory_receipt_items_product_id_fkey";

-- DropForeignKey
ALTER TABLE "inventory_receipt_items" DROP CONSTRAINT "inventory_receipt_items_receipt_id_fkey";

-- DropForeignKey
ALTER TABLE "order_items" DROP CONSTRAINT "order_items_allocated_product_id_fkey";

-- DropForeignKey
ALTER TABLE "order_items" DROP CONSTRAINT "order_items_order_id_fkey";

-- DropForeignKey
ALTER TABLE "order_items" DROP CONSTRAINT "order_items_product_id_fkey";

-- DropForeignKey
ALTER TABLE "order_status_history" DROP CONSTRAINT "order_status_history_order_id_fkey";

-- DropForeignKey
ALTER TABLE "product_blindboxes" DROP CONSTRAINT "product_blindboxes_product_id_fkey";

-- DropForeignKey
ALTER TABLE "product_preorders" DROP CONSTRAINT "product_preorders_product_id_fkey";

-- DropIndex
DROP INDEX "idx_products_sku";

-- DropIndex
DROP INDEX "products_barcode_key";

-- DropIndex
DROP INDEX "products_sku_key";

-- AlterTable
ALTER TABLE "cart_items" DROP COLUMN "product_id",
ADD COLUMN     "variant_id" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "inventory_logs" DROP COLUMN "product_id",
ADD COLUMN     "variant_id" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "inventory_receipt_items" DROP COLUMN "product_id",
ADD COLUMN     "variant_id" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "order_items" DROP COLUMN "product_id",
ADD COLUMN     "variant_id" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "product_blindboxes" DROP COLUMN "margin_rate",
DROP COLUMN "price_config",
ADD COLUMN     "max_value_allow" DECIMAL(15,2),
ADD COLUMN     "min_value_allow" DECIMAL(15,2),
ADD COLUMN     "price" DECIMAL(15,2) NOT NULL,
ADD COLUMN     "target_margin" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "product_preorders" ADD COLUMN     "max_slots" INTEGER;

-- AlterTable
ALTER TABLE "products" DROP COLUMN "barcode",
DROP COLUMN "price",
DROP COLUMN "sku",
DROP COLUMN "stock_available",
DROP COLUMN "stock_defect";

-- CreateTable
CREATE TABLE "product_variants" (
    "variant_id" SERIAL NOT NULL,
    "product_id" INTEGER NOT NULL,
    "sku" VARCHAR(50) NOT NULL,
    "option_name" VARCHAR(100) NOT NULL,
    "price" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "stock_available" INTEGER NOT NULL DEFAULT 0,
    "stock_defect" INTEGER NOT NULL DEFAULT 0,
    "barcode" VARCHAR(50),
    "image_url" TEXT,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(6),

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("variant_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_sku_key" ON "product_variants"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_barcode_key" ON "product_variants"("barcode");

-- CreateIndex
CREATE INDEX "idx_variants_sku" ON "product_variants"("sku");

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("variant_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "inventory_logs" ADD CONSTRAINT "inventory_logs_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("variant_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "inventory_receipt_items" ADD CONSTRAINT "inventory_receipt_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("variant_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "inventory_receipt_items" ADD CONSTRAINT "inventory_receipt_items_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "inventory_receipts"("receipt_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("order_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("variant_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("order_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "product_blindboxes" ADD CONSTRAINT "product_blindboxes_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "product_preorders" ADD CONSTRAINT "product_preorders_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE CASCADE ON UPDATE NO ACTION;
