-- AlterTable
ALTER TABLE "timesheets" ADD COLUMN     "check_in_img_url" TEXT,
ADD COLUMN     "check_in_score" DOUBLE PRECISION,
ADD COLUMN     "check_out_img_url" TEXT,
ADD COLUMN     "check_out_score" DOUBLE PRECISION;
