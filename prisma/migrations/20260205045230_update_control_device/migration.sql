-- CreateTable
CREATE TABLE "access_controls" (
    "control_id" SERIAL NOT NULL,
    "role_code" VARCHAR(50) NOT NULL,
    "ip_address" VARCHAR(45) NOT NULL,
    "description" VARCHAR(255),
    "is_active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_controls_pkey" PRIMARY KEY ("control_id")
);

-- CreateIndex
CREATE INDEX "idx_access_control_lookup" ON "access_controls"("role_code", "ip_address", "is_active");
