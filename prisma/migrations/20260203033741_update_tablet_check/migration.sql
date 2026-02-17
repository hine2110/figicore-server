-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "face_descriptor" JSONB;

-- AlterTable
ALTER TABLE "timesheets" ADD COLUMN     "checkin_payload" JSONB,
ADD COLUMN     "is_flagged" BOOLEAN DEFAULT false,
ADD COLUMN     "station_id" INTEGER;

-- CreateTable
CREATE TABLE "checkin_stations" (
    "station_id" SERIAL NOT NULL,
    "station_name" VARCHAR(100) NOT NULL,
    "station_token" VARCHAR(255) NOT NULL,
    "is_active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checkin_stations_pkey" PRIMARY KEY ("station_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "checkin_stations_station_token_key" ON "checkin_stations"("station_token");

-- AddForeignKey
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "checkin_stations"("station_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
