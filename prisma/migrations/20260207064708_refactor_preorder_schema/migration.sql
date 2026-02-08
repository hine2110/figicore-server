/*
  Warnings:

  - You are about to drop the column `contract_code` on the `preorder_contracts` table. All the data in the column will be lost.
  - You are about to drop the column `deleted_at` on the `preorder_contracts` table. All the data in the column will be lost.
  - You are about to drop the column `deposit_per_unit` on the `preorder_contracts` table. All the data in the column will be lost.
  - You are about to drop the column `full_price_per_unit` on the `preorder_contracts` table. All the data in the column will be lost.
  - You are about to drop the column `is_full_payment` on the `preorder_contracts` table. All the data in the column will be lost.
  - You are about to drop the column `is_shipping_free` on the `preorder_contracts` table. All the data in the column will be lost.
  - You are about to drop the column `note` on the `preorder_contracts` table. All the data in the column will be lost.
  - You are about to drop the column `product_id` on the `preorder_contracts` table. All the data in the column will be lost.
  - You are about to drop the column `release_date` on the `preorder_contracts` table. All the data in the column will be lost.
  - You are about to drop the column `shipping_note` on the `preorder_contracts` table. All the data in the column will be lost.
  - You are about to drop the column `total_deposit` on the `preorder_contracts` table. All the data in the column will be lost.
  - You are about to drop the column `total_remaining` on the `preorder_contracts` table. All the data in the column will be lost.
  - You are about to drop the column `deposit_amount` on the `product_variants` table. All the data in the column will be lost.
  - You are about to drop the column `full_price` on the `product_variants` table. All the data in the column will be lost.
  - You are about to drop the column `is_preorder` on the `product_variants` table. All the data in the column will be lost.
  - You are about to drop the column `max_qty_per_user` on the `product_variants` table. All the data in the column will be lost.
  - You are about to drop the column `preorder_release_date` on the `product_variants` table. All the data in the column will be lost.
  - You are about to drop the column `preorder_slot_limit` on the `product_variants` table. All the data in the column will be lost.
  - You are about to drop the column `preorder_sold_quantity` on the `product_variants` table. All the data in the column will be lost.
  - You are about to drop the `preorder_payments` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `product_preorders` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[order_code]` on the table `preorder_contracts` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `order_code` to the `preorder_contracts` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "preorder_contracts" DROP CONSTRAINT "preorder_contracts_product_id_fkey";

-- DropForeignKey
ALTER TABLE "preorder_payments" DROP CONSTRAINT "preorder_payments_contract_id_fkey";

-- DropForeignKey
ALTER TABLE "preorder_payments" DROP CONSTRAINT "preorder_payments_order_id_fkey";

-- DropForeignKey
ALTER TABLE "product_preorders" DROP CONSTRAINT "product_preorders_product_id_fkey";

-- DropIndex
DROP INDEX "preorder_contracts_contract_code_key";

-- DropIndex
DROP INDEX "preorder_contracts_status_code_idx";

-- DropIndex
DROP INDEX "preorder_contracts_user_id_idx";

-- DropIndex
DROP INDEX "preorder_contracts_variant_id_idx";

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "payment_ref_code" VARCHAR(50);

-- AlterTable
ALTER TABLE "preorder_contracts" DROP COLUMN "contract_code",
DROP COLUMN "deleted_at",
DROP COLUMN "deposit_per_unit",
DROP COLUMN "full_price_per_unit",
DROP COLUMN "is_full_payment",
DROP COLUMN "is_shipping_free",
DROP COLUMN "note",
DROP COLUMN "product_id",
DROP COLUMN "release_date",
DROP COLUMN "shipping_note",
DROP COLUMN "total_deposit",
DROP COLUMN "total_remaining",
ADD COLUMN     "deposit_amount_paid" DECIMAL(65,30) DEFAULT 0,
ADD COLUMN     "deposit_order_id" INTEGER,
ADD COLUMN     "final_payment_order_id" INTEGER,
ADD COLUMN     "order_code" VARCHAR(50) NOT NULL,
ADD COLUMN     "remaining_amount" DECIMAL(65,30) DEFAULT 0,
ALTER COLUMN "status_code" SET DATA TYPE TEXT,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "product_variants" DROP COLUMN "deposit_amount",
DROP COLUMN "full_price",
DROP COLUMN "is_preorder",
DROP COLUMN "max_qty_per_user",
DROP COLUMN "preorder_release_date",
DROP COLUMN "preorder_slot_limit",
DROP COLUMN "preorder_sold_quantity",
ADD COLUMN     "included_items" JSONB,
ADD COLUMN     "material" VARCHAR(100),
ADD COLUMN     "scale" VARCHAR(50);

-- DropTable
DROP TABLE "preorder_payments";

-- DropTable
DROP TABLE "product_preorders";

-- CreateTable
CREATE TABLE "product_preorder_configs" (
    "config_id" SERIAL NOT NULL,
    "variant_id" INTEGER NOT NULL,
    "deposit_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "full_price" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "release_date" TIMESTAMP(6),
    "total_slots" INTEGER NOT NULL DEFAULT 0,
    "sold_slots" INTEGER NOT NULL DEFAULT 0,
    "max_qty_per_user" INTEGER NOT NULL DEFAULT 1,
    "stock_held" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_preorder_configs_pkey" PRIMARY KEY ("config_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_preorder_configs_variant_id_key" ON "product_preorder_configs"("variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "preorder_contracts_order_code_key" ON "preorder_contracts"("order_code");

-- AddForeignKey
ALTER TABLE "product_preorder_configs" ADD CONSTRAINT "product_preorder_configs_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("variant_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preorder_contracts" ADD CONSTRAINT "preorder_contracts_deposit_order_id_fkey" FOREIGN KEY ("deposit_order_id") REFERENCES "orders"("order_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preorder_contracts" ADD CONSTRAINT "preorder_contracts_final_payment_order_id_fkey" FOREIGN KEY ("final_payment_order_id") REFERENCES "orders"("order_id") ON DELETE SET NULL ON UPDATE CASCADE;
