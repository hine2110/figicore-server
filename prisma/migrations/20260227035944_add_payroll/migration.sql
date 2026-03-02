-- AlterTable
ALTER TABLE "payrolls" ADD COLUMN     "approver_id" INTEGER,
ADD COLUMN     "reviewer_id" INTEGER;

-- CreateTable
CREATE TABLE "employee_salary_configs" (
    "config_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "type_code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "is_recurring" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_salary_configs_pkey" PRIMARY KEY ("config_id")
);

-- CreateTable
CREATE TABLE "payroll_items" (
    "item_id" SERIAL NOT NULL,
    "payroll_id" INTEGER NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "is_addition" BOOLEAN DEFAULT true,

    CONSTRAINT "payroll_items_pkey" PRIMARY KEY ("item_id")
);

-- CreateTable
CREATE TABLE "leave_requests" (
    "request_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "type_code" VARCHAR(50) NOT NULL,
    "start_date" TIMESTAMP(6) NOT NULL,
    "end_date" TIMESTAMP(6) NOT NULL,
    "reason" TEXT,
    "status_code" VARCHAR(50) DEFAULT 'PENDING',
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("request_id")
);

-- CreateTable
CREATE TABLE "payroll_disputes" (
    "dispute_id" SERIAL NOT NULL,
    "payroll_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "response" TEXT,
    "status_code" VARCHAR(50) DEFAULT 'OPEN',
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_disputes_pkey" PRIMARY KEY ("dispute_id")
);

-- AddForeignKey
ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "employees"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "employees"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee_salary_configs" ADD CONSTRAINT "employee_salary_configs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "employees"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_payroll_id_fkey" FOREIGN KEY ("payroll_id") REFERENCES "payrolls"("payroll_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "employees"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payroll_disputes" ADD CONSTRAINT "payroll_disputes_payroll_id_fkey" FOREIGN KEY ("payroll_id") REFERENCES "payrolls"("payroll_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payroll_disputes" ADD CONSTRAINT "payroll_disputes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "employees"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
