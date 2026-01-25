/*
  Warnings:

  - A unique constraint covering the columns `[google_id]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "users" ALTER COLUMN "phone" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "users_google_id_key" ON "users"("google_id");
