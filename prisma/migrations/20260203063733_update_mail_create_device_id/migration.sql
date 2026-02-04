/*
  Warnings:

  - A unique constraint covering the columns `[verification_token]` on the table `checkin_stations` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "checkin_stations" ADD COLUMN     "verification_token" VARCHAR(255);

-- CreateIndex
CREATE UNIQUE INDEX "checkin_stations_verification_token_key" ON "checkin_stations"("verification_token");
