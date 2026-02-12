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
