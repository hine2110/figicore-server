-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "tax_amount" DECIMAL(15,2) DEFAULT 0,
ADD COLUMN     "tax_rate" DOUBLE PRECISION DEFAULT 0;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "is_vat_export" BOOLEAN DEFAULT false,
ADD COLUMN     "total_tax" DECIMAL(15,2) DEFAULT 0,
ADD COLUMN     "vat_company_address" VARCHAR(500),
ADD COLUMN     "vat_company_name" VARCHAR(255),
ADD COLUMN     "vat_invoice_email" VARCHAR(100),
ADD COLUMN     "vat_tax_number" VARCHAR(50);

-- AlterTable
ALTER TABLE "product_variants" ADD COLUMN     "tax_rate" DOUBLE PRECISION DEFAULT 0;
