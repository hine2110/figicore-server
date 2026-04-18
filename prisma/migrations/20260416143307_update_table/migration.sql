-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "packed_by_staff_id" INTEGER;

-- AlterTable
ALTER TABLE "return_requests" ADD COLUMN     "processed_by_staff_id" INTEGER;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_packed_by_staff_id_fkey" FOREIGN KEY ("packed_by_staff_id") REFERENCES "employees"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_processed_by_staff_id_fkey" FOREIGN KEY ("processed_by_staff_id") REFERENCES "employees"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
