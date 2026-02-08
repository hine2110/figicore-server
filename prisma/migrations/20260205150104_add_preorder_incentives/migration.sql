-- AlterTable
ALTER TABLE "preorder_contracts" ADD COLUMN     "is_full_payment" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_shipping_free" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "shipping_note" VARCHAR(255);
