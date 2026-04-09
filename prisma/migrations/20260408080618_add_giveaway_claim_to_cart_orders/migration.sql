-- AlterTable
ALTER TABLE "cart_items" ADD COLUMN     "giveaway_claim_id" INTEGER;

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "giveaway_claim_id" INTEGER;
