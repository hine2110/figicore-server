-- AlterTable
ALTER TABLE "product_variants" ADD COLUMN     "full_price" DECIMAL(15,2),
ADD COLUMN     "is_preorder" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "preorder_release_date" TIMESTAMP(6);

-- CreateTable
CREATE TABLE "preorder_contracts" (
    "contract_id" SERIAL NOT NULL,
    "contract_code" VARCHAR(50) NOT NULL,
    "user_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "variant_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "deposit_per_unit" DECIMAL(15,2) NOT NULL,
    "full_price_per_unit" DECIMAL(15,2) NOT NULL,
    "total_deposit" DECIMAL(15,2) NOT NULL,
    "total_remaining" DECIMAL(15,2) NOT NULL,
    "release_date" TIMESTAMP(6) NOT NULL,
    "status_code" VARCHAR(50) NOT NULL DEFAULT 'WAITING_DEPOSIT',
    "note" TEXT,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(6),

    CONSTRAINT "preorder_contracts_pkey" PRIMARY KEY ("contract_id")
);

-- CreateTable
CREATE TABLE "preorder_payments" (
    "payment_id" SERIAL NOT NULL,
    "contract_id" INTEGER NOT NULL,
    "order_id" INTEGER NOT NULL,
    "payment_type" VARCHAR(20) NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "preorder_payments_pkey" PRIMARY KEY ("payment_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "preorder_contracts_contract_code_key" ON "preorder_contracts"("contract_code");

-- CreateIndex
CREATE INDEX "preorder_contracts_user_id_idx" ON "preorder_contracts"("user_id");

-- CreateIndex
CREATE INDEX "preorder_contracts_status_code_idx" ON "preorder_contracts"("status_code");

-- CreateIndex
CREATE INDEX "preorder_contracts_variant_id_idx" ON "preorder_contracts"("variant_id");

-- CreateIndex
CREATE INDEX "preorder_payments_contract_id_idx" ON "preorder_payments"("contract_id");

-- CreateIndex
CREATE INDEX "preorder_payments_order_id_idx" ON "preorder_payments"("order_id");

-- AddForeignKey
ALTER TABLE "preorder_contracts" ADD CONSTRAINT "preorder_contracts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preorder_contracts" ADD CONSTRAINT "preorder_contracts_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preorder_contracts" ADD CONSTRAINT "preorder_contracts_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("variant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preorder_payments" ADD CONSTRAINT "preorder_payments_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "preorder_contracts"("contract_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preorder_payments" ADD CONSTRAINT "preorder_payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("order_id") ON DELETE RESTRICT ON UPDATE CASCADE;
