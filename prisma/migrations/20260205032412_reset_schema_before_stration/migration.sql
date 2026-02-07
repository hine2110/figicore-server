/*
  Warnings:

  - You are about to drop the column `face_descriptor` on the `employees` table. All the data in the column will be lost.
  - You are about to drop the column `deposit_amount` on the `product_preorders` table. All the data in the column will be lost.
  - You are about to drop the column `full_price` on the `product_preorders` table. All the data in the column will be lost.
  - You are about to drop the column `max_slots` on the `product_preorders` table. All the data in the column will be lost.
  - You are about to drop the column `checkin_payload` on the `timesheets` table. All the data in the column will be lost.
  - You are about to drop the column `is_flagged` on the `timesheets` table. All the data in the column will be lost.
  - You are about to drop the column `station_id` on the `timesheets` table. All the data in the column will be lost.
  - You are about to drop the `checkin_stations` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "timesheets" DROP CONSTRAINT "timesheets_station_id_fkey";

-- AlterTable
ALTER TABLE "employees" DROP COLUMN "face_descriptor";

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
ALTER TABLE "timesheets" DROP COLUMN "checkin_payload",
DROP COLUMN "is_flagged",
DROP COLUMN "station_id";

-- DropTable
DROP TABLE "checkin_stations";
