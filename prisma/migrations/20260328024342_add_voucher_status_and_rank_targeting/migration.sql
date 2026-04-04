/*
  Warnings:

  - You are about to drop the column `is_used` on the `user_vouchers` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[user_id,promotion_id]` on the table `user_vouchers` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "VoucherStatus" AS ENUM ('COLLECTED', 'USED', 'EXPIRED');

-- AlterTable
ALTER TABLE "user_vouchers" DROP COLUMN "is_used",
ADD COLUMN     "collected_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "status" "VoucherStatus" NOT NULL DEFAULT 'COLLECTED',
ADD COLUMN     "used_at" TIMESTAMP(6);

-- CreateIndex
CREATE INDEX "user_vouchers_user_id_status_idx" ON "user_vouchers"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "user_vouchers_user_id_promotion_id_key" ON "user_vouchers"("user_id", "promotion_id");
