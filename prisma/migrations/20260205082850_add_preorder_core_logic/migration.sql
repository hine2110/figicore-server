-- AlterTable
ALTER TABLE "product_variants" ADD COLUMN     "max_qty_per_user" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "preorder_sold_quantity" INTEGER NOT NULL DEFAULT 0;
