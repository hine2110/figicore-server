-- CreateTable
CREATE TABLE "timesheet_corrections" (
    "correction_id" SERIAL NOT NULL,
    "timesheet_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "evidence_url" TEXT,
    "status_code" VARCHAR(50) DEFAULT 'PENDING',
    "manager_note" TEXT,
    "reviewer_id" INTEGER,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "timesheet_corrections_pkey" PRIMARY KEY ("correction_id")
);

-- AddForeignKey
ALTER TABLE "timesheet_corrections" ADD CONSTRAINT "timesheet_corrections_timesheet_id_fkey" FOREIGN KEY ("timesheet_id") REFERENCES "timesheets"("timesheet_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "timesheet_corrections" ADD CONSTRAINT "timesheet_corrections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "employees"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "timesheet_corrections" ADD CONSTRAINT "timesheet_corrections_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "employees"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
