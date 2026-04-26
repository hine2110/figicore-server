-- CreateEnum
CREATE TYPE "VoucherStatus" AS ENUM ('COLLECTED', 'USED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "RecommendationType" AS ENUM ('CLEARANCE', 'RESTOCK');

-- CreateEnum
CREATE TYPE "RecommendationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUPERSEDED');

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

-- CreateTable
CREATE TABLE "addresses" (
    "address_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "recipient_name" VARCHAR(100) NOT NULL,
    "recipient_phone" VARCHAR(255) NOT NULL,
    "province_id" INTEGER NOT NULL,
    "district_id" INTEGER NOT NULL,
    "ward_code" VARCHAR(20) NOT NULL,
    "detail_address" TEXT NOT NULL,
    "ward_name" VARCHAR(100),
    "district_name" VARCHAR(100),
    "province_name" VARCHAR(100),
    "is_default" BOOLEAN DEFAULT false,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(6),

    CONSTRAINT "addresses_pkey" PRIMARY KEY ("address_id")
);

-- CreateTable
CREATE TABLE "brands" (
    "brand_id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "logo_url" TEXT,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(6),

    CONSTRAINT "brands_pkey" PRIMARY KEY ("brand_id")
);

-- CreateTable
CREATE TABLE "cart_items" (
    "item_id" SERIAL NOT NULL,
    "cart_id" INTEGER NOT NULL,
    "variant_id" INTEGER NOT NULL,
    "livestream_id" INTEGER,
    "quantity" INTEGER DEFAULT 1,
    "payment_option" VARCHAR(20) NOT NULL DEFAULT 'DEPOSIT',
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(6),
    "giveaway_claim_id" INTEGER,
    "is_flash_sale" BOOLEAN DEFAULT false,

    CONSTRAINT "cart_items_pkey" PRIMARY KEY ("item_id")
);

-- CreateTable
CREATE TABLE "carts" (
    "cart_id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(6),

    CONSTRAINT "carts_pkey" PRIMARY KEY ("cart_id")
);

-- CreateTable
CREATE TABLE "categories" (
    "category_id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "parent_id" INTEGER,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(6),

    CONSTRAINT "categories_pkey" PRIMARY KEY ("category_id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "message_id" SERIAL NOT NULL,
    "session_id" INTEGER NOT NULL,
    "sender_type" VARCHAR(20) NOT NULL,
    "content" TEXT,
    "message_type" VARCHAR(20) DEFAULT 'TEXT',
    "payload" JSONB,
    "tokens_used" INTEGER DEFAULT 0,
    "is_helpful" BOOLEAN,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(6),

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("message_id")
);

-- CreateTable
CREATE TABLE "chat_sessions" (
    "session_id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "title" VARCHAR(255),
    "context_data" JSONB,
    "total_tokens_used" INTEGER DEFAULT 0,
    "status_code" VARCHAR(20) DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(6),

    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("session_id")
);

-- CreateTable
CREATE TABLE "customers" (
    "user_id" INTEGER NOT NULL,
    "loyalty_points" INTEGER DEFAULT 0,
    "current_rank_code" VARCHAR(50) DEFAULT 'BRONZE',
    "total_spent" DECIMAL(15,2) DEFAULT 0,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(6),

    CONSTRAINT "customers_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "employees" (
    "user_id" INTEGER NOT NULL,
    "employee_code" VARCHAR(20) NOT NULL,
    "job_title_code" VARCHAR(50) NOT NULL,
    "base_salary" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "start_date" DATE,
    "bank_name" VARCHAR(100),
    "bank_account_no" VARCHAR(50),
    "bank_account_name" VARCHAR(100),
    "bank_qr_code_url" TEXT,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(6),

    CONSTRAINT "employees_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "feedbacks" (
    "feedback_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "order_id" INTEGER NOT NULL,
    "rating" INTEGER NOT NULL,
    "content" TEXT,
    "media_urls" JSONB,
    "reply_content" TEXT,
    "status_code" VARCHAR(20) DEFAULT 'APPROVED',
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(6),

    CONSTRAINT "feedbacks_pkey" PRIMARY KEY ("feedback_id")
);

-- CreateTable
CREATE TABLE "inventory_logs" (
    "log_id" SERIAL NOT NULL,
    "variant_id" INTEGER NOT NULL,
    "change_amount" INTEGER NOT NULL,
    "change_type_code" VARCHAR(50) NOT NULL,
    "reference_id" INTEGER,
    "note" TEXT,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(6),

    CONSTRAINT "inventory_logs_pkey" PRIMARY KEY ("log_id")
);

-- CreateTable
CREATE TABLE "inventory_receipt_items" (
    "item_id" SERIAL NOT NULL,
    "receipt_id" INTEGER NOT NULL,
    "variant_id" INTEGER NOT NULL,
    "quantity_total" INTEGER NOT NULL,
    "quantity_good" INTEGER DEFAULT 0,
    "quantity_defect" INTEGER DEFAULT 0,
    "import_price" DECIMAL(15,2),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(6),

    CONSTRAINT "inventory_receipt_items_pkey" PRIMARY KEY ("item_id")
);

-- CreateTable
CREATE TABLE "inventory_receipts" (
    "receipt_id" SERIAL NOT NULL,
    "warehouse_staff_id" INTEGER,
    "total_amount" DECIMAL(15,2),
    "status_code" VARCHAR(20) DEFAULT 'COMPLETED',
    "import_date" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(6),

    CONSTRAINT "inventory_receipts_pkey" PRIMARY KEY ("receipt_id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "notification_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "title" VARCHAR(255),
    "content" TEXT,
    "target_url" TEXT,
    "is_read" BOOLEAN DEFAULT false,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(6),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("notification_id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "item_id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "variant_id" INTEGER NOT NULL,
    "allocated_product_id" INTEGER,
    "is_opened" BOOLEAN DEFAULT false,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(15,2) NOT NULL,
    "total_price" DECIMAL(15,2) NOT NULL,
    "tax_rate" DOUBLE PRECISION DEFAULT 0,
    "tax_amount" DECIMAL(15,2) DEFAULT 0,
    "livestream_id" INTEGER,
    "metadata" JSONB,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(6),
    "giveaway_claim_id" INTEGER,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("item_id")
);

-- CreateTable
CREATE TABLE "order_status_history" (
    "history_id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "previous_status" VARCHAR(50),
    "new_status" VARCHAR(50) NOT NULL,
    "changed_by_user_id" INTEGER,
    "note" TEXT,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("history_id")
);

-- CreateTable
CREATE TABLE "orders" (
    "order_id" SERIAL NOT NULL,
    "order_code" VARCHAR(50) NOT NULL,
    "user_id" INTEGER,
    "session_id" INTEGER,
    "created_by_staff_id" INTEGER,
    "shipping_address_id" INTEGER,
    "promotion_id" INTEGER,
    "shipping_promotion_id" INTEGER,
    "total_amount" DECIMAL(15,2) NOT NULL,
    "paid_amount" DECIMAL(15,2) DEFAULT 0,
    "discount_amount" DECIMAL(15,2) DEFAULT 0,
    "shipping_fee" DECIMAL(15,2) DEFAULT 0,
    "original_shipping_fee" DECIMAL(15,2) DEFAULT 0,
    "payment_deadline" TIMESTAMP(6),
    "channel_code" VARCHAR(20) NOT NULL,
    "payment_method_code" VARCHAR(20),
    "payment_ref_code" VARCHAR(50),
    "status_code" VARCHAR(50) DEFAULT 'PENDING',
    "packing_video_urls" JSONB,
    "packed_by_staff_id" INTEGER,
    "packed_at" TIMESTAMP(6),
    "note" TEXT,
    "cash_received" DECIMAL(15,2),
    "cash_change" DECIMAL(15,2),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(6),

    CONSTRAINT "orders_pkey" PRIMARY KEY ("order_id")
);

-- CreateTable
CREATE TABLE "payment_transactions" (
    "id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "sepay_id" INTEGER NOT NULL,
    "bank_brand_name" VARCHAR(100),
    "account_number" VARCHAR(50),
    "transaction_date" TIMESTAMP(6),
    "amount" DECIMAL(15,2) NOT NULL,
    "transaction_content" TEXT,
    "reference_number" VARCHAR(100),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payrolls" (
    "payroll_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "total_work_hours" DOUBLE PRECISION DEFAULT 0,
    "final_salary" DECIMAL(15,2) DEFAULT 0,
    "status_code" VARCHAR(20) DEFAULT 'DRAFT',
    "reviewer_id" INTEGER,
    "approver_id" INTEGER,
    "payment_start_date" TIMESTAMP(6),
    "payment_end_date" TIMESTAMP(6),
    "signature_data" TEXT,
    "signed_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(6),

    CONSTRAINT "payrolls_pkey" PRIMARY KEY ("payroll_id")
);

-- CreateTable
CREATE TABLE "pos_sessions" (
    "session_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "opened_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(6),
    "opening_cash" DECIMAL(15,2) DEFAULT 0,
    "closing_cash" DECIMAL(15,2),
    "cash_revenue_app" DECIMAL(15,2) DEFAULT 0,
    "total_expenses" DECIMAL(15,2) DEFAULT 0,
    "cash_breakdown" JSONB,
    "status_code" VARCHAR(20) DEFAULT 'OPEN',
    "note" TEXT,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(6),

    CONSTRAINT "pos_sessions_pkey" PRIMARY KEY ("session_id")
);

-- CreateTable
CREATE TABLE "product_blindboxes" (
    "product_id" INTEGER NOT NULL,
    "price" DECIMAL(15,2) NOT NULL,
    "min_value" DECIMAL(15,2),
    "max_value" DECIMAL(15,2),
    "tier_config" JSONB,
    "start_time" TIMESTAMP(6),
    "end_time" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(6),

    CONSTRAINT "product_blindboxes_pkey" PRIMARY KEY ("product_id")
);

-- CreateTable
CREATE TABLE "product_preorder_configs" (
    "config_id" SERIAL NOT NULL,
    "variant_id" INTEGER NOT NULL,
    "deposit_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "full_price" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "release_date" TIMESTAMP(6),
    "total_slots" INTEGER NOT NULL DEFAULT 50,
    "sold_slots" INTEGER NOT NULL DEFAULT 0,
    "max_qty_per_user" INTEGER NOT NULL DEFAULT 1,
    "stock_held" INTEGER NOT NULL DEFAULT 0,
    "booking_end_date" TIMESTAMP(6),
    "extension_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_preorder_configs_pkey" PRIMARY KEY ("config_id")
);

-- CreateTable
CREATE TABLE "preorder_contracts" (
    "contract_id" SERIAL NOT NULL,
    "order_code" VARCHAR(50) NOT NULL,
    "user_id" INTEGER NOT NULL,
    "variant_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "status_code" TEXT NOT NULL DEFAULT 'WAITING_DEPOSIT',
    "deposit_order_id" INTEGER,
    "final_payment_order_id" INTEGER,
    "deposit_amount_paid" DECIMAL(65,30) DEFAULT 0,
    "remaining_amount" DECIMAL(65,30) DEFAULT 0,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "preorder_contracts_pkey" PRIMARY KEY ("contract_id")
);

-- CreateTable
CREATE TABLE "products" (
    "product_id" SERIAL NOT NULL,
    "category_id" INTEGER,
    "brand_id" INTEGER,
    "series_id" INTEGER,
    "name" VARCHAR(255) NOT NULL,
    "type_code" VARCHAR(50) NOT NULL,
    "status_code" VARCHAR(50) DEFAULT 'DRAFT',
    "specifications" JSONB,
    "media_urls" JSONB,
    "description" TEXT,
    "version" INTEGER DEFAULT 1,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(6),

    CONSTRAINT "products_pkey" PRIMARY KEY ("product_id")
);

-- CreateTable
CREATE TABLE "product_variants" (
    "variant_id" SERIAL NOT NULL,
    "product_id" INTEGER NOT NULL,
    "sku" VARCHAR(50) NOT NULL,
    "option_name" VARCHAR(100) NOT NULL,
    "price" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "cost_price" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "stock_available" INTEGER NOT NULL DEFAULT 0,
    "stock_defect" INTEGER NOT NULL DEFAULT 0,
    "stock_factory_defect" INTEGER NOT NULL DEFAULT 0,
    "weight_g" INTEGER NOT NULL DEFAULT 200,
    "length_cm" INTEGER NOT NULL DEFAULT 10,
    "width_cm" INTEGER NOT NULL DEFAULT 10,
    "height_cm" INTEGER NOT NULL DEFAULT 10,
    "scale" VARCHAR(50),
    "material" VARCHAR(100),
    "included_items" JSONB,
    "barcode" VARCHAR(50),
    "description" TEXT,
    "media_assets" JSONB DEFAULT '[]',
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(6),
    "product_promotion_id" INTEGER,
    "previous_promotion_id" INTEGER,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("variant_id")
);

-- CreateTable
CREATE TABLE "profile_update_requests" (
    "request_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "changed_data" JSONB NOT NULL,
    "status_code" VARCHAR(20) DEFAULT 'PENDING',
    "admin_note" TEXT,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(6),

    CONSTRAINT "profile_update_requests_pkey" PRIMARY KEY ("request_id")
);

-- CreateTable
CREATE TABLE "product_promotions" (
    "promotion_id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "type_code" VARCHAR(50) NOT NULL,
    "value" DECIMAL(15,2) NOT NULL,
    "start_time" VARCHAR(5) NOT NULL,
    "end_time" VARCHAR(5) NOT NULL,
    "is_recurring" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN DEFAULT true,
    "min_apply_price" DECIMAL(15,2),
    "max_apply_price" DECIMAL(15,2),
    "is_flash_sale" BOOLEAN NOT NULL DEFAULT false,
    "start_date" TIMESTAMP(6),
    "end_date" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(6),

    CONSTRAINT "product_promotions_pkey" PRIMARY KEY ("promotion_id")
);

-- CreateTable
CREATE TABLE "promotion_items" (
    "item_id" SERIAL NOT NULL,
    "promotion_id" INTEGER NOT NULL,
    "variant_id" INTEGER NOT NULL,
    "flash_sale_price" DECIMAL(15,2) NOT NULL,
    "quota" INTEGER NOT NULL DEFAULT 0,
    "sold" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "promotion_items_pkey" PRIMARY KEY ("item_id")
);

-- CreateTable
CREATE TABLE "promotions" (
    "promotion_id" SERIAL NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "discount_value" DECIMAL(15,2),
    "discount_type" VARCHAR(20),
    "max_discount_amount" DECIMAL(15,2),
    "min_order_value" DECIMAL(15,2) DEFAULT 0,
    "apply_rank_code" VARCHAR(50),
    "max_quantity" INTEGER,
    "collected_quantity" INTEGER DEFAULT 0,
    "is_public" BOOLEAN DEFAULT true,
    "is_active" BOOLEAN DEFAULT true,
    "start_date" TIMESTAMP(6),
    "end_date" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(6),

    CONSTRAINT "promotions_pkey" PRIMARY KEY ("promotion_id")
);

-- CreateTable
CREATE TABLE "return_items" (
    "return_item_id" SERIAL NOT NULL,
    "return_id" INTEGER NOT NULL,
    "order_item_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(6),

    CONSTRAINT "return_items_pkey" PRIMARY KEY ("return_item_id")
);

-- CreateTable
CREATE TABLE "return_requests" (
    "return_id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "reason" TEXT,
    "unbox_video_url" TEXT,
    "defect_image_urls" TEXT,
    "status_code" VARCHAR(50) DEFAULT 'PENDING',
    "processed_by_staff_id" INTEGER,
    "admin_note" TEXT,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(6),

    CONSTRAINT "return_requests_pkey" PRIMARY KEY ("return_id")
);

-- CreateTable
CREATE TABLE "series" (
    "series_id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(6),

    CONSTRAINT "series_pkey" PRIMARY KEY ("series_id")
);

-- CreateTable
CREATE TABLE "shipments" (
    "shipment_id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "tracking_code" VARCHAR(50),
    "ghn_service_id" INTEGER,
    "cod_amount" DECIMAL(15,2) DEFAULT 0,
    "shipping_fee" DECIMAL(15,2),
    "status_code" VARCHAR(50),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(6),

    CONSTRAINT "shipments_pkey" PRIMARY KEY ("shipment_id")
);

-- CreateTable
CREATE TABLE "store_expenses" (
    "expense_id" SERIAL NOT NULL,
    "session_id" INTEGER,
    "user_id" INTEGER NOT NULL,
    "title" VARCHAR(255),
    "amount" DECIMAL(15,2) NOT NULL,
    "reason" TEXT,
    "description" TEXT,
    "expense_date" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(6),

    CONSTRAINT "store_expenses_pkey" PRIMARY KEY ("expense_id")
);

-- CreateTable
CREATE TABLE "system_banners" (
    "banner_id" SERIAL NOT NULL,
    "title" VARCHAR(100),
    "image_url" TEXT NOT NULL,
    "target_url" TEXT,
    "sort_order" INTEGER DEFAULT 0,
    "is_active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_banners_pkey" PRIMARY KEY ("banner_id")
);

-- CreateTable
CREATE TABLE "system_configurations" (
    "config_id" SERIAL NOT NULL,
    "config_key" VARCHAR(100) NOT NULL,
    "config_value" TEXT,
    "description" TEXT,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(6),

    CONSTRAINT "system_configurations_pkey" PRIMARY KEY ("config_id")
);

-- CreateTable
CREATE TABLE "system_lookups" (
    "id" SERIAL NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "value" VARCHAR(255) NOT NULL,
    "sort_order" INTEGER DEFAULT 0,
    "meta_data" JSONB,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(6),

    CONSTRAINT "system_lookups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timesheets" (
    "timesheet_id" SERIAL NOT NULL,
    "schedule_id" INTEGER,
    "check_in_at" TIMESTAMP(6),
    "check_out_at" TIMESTAMP(6),
    "real_work_hours" DOUBLE PRECISION DEFAULT 0,
    "applied_hourly_rate" DECIMAL(15,2),
    "status_code" VARCHAR(20),
    "check_in_img_url" TEXT,
    "check_in_score" DOUBLE PRECISION,
    "check_out_img_url" TEXT,
    "check_out_score" DOUBLE PRECISION,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(6),

    CONSTRAINT "timesheets_pkey" PRIMARY KEY ("timesheet_id")
);

-- CreateTable
CREATE TABLE "user_login_logs" (
    "log_id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "ip_address" VARCHAR(45) NOT NULL,
    "user_agent" TEXT,
    "device_name" VARCHAR(100),
    "os_name" VARCHAR(50),
    "browser_name" VARCHAR(50),
    "location" VARCHAR(255),
    "status_code" VARCHAR(20) DEFAULT 'SUCCESS',
    "is_suspicious" BOOLEAN DEFAULT false,
    "risk_reason" VARCHAR(255),
    "login_time" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_login_logs_pkey" PRIMARY KEY ("log_id")
);

-- CreateTable
CREATE TABLE "user_vouchers" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "promotion_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(6),
    "collected_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "VoucherStatus" NOT NULL DEFAULT 'COLLECTED',
    "used_at" TIMESTAMP(6),

    CONSTRAINT "user_vouchers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "user_id" SERIAL NOT NULL,
    "phone" VARCHAR(255),
    "email" VARCHAR(255),
    "password_hash" VARCHAR(255),
    "full_name" VARCHAR(100) NOT NULL,
    "avatar_url" TEXT,
    "role_code" VARCHAR(50) NOT NULL,
    "status_code" VARCHAR(50) DEFAULT 'ACTIVE',
    "is_verified" BOOLEAN DEFAULT false,
    "google_id" VARCHAR(100),
    "otp_code" VARCHAR(10),
    "otp_expires_at" TIMESTAMP(6),
    "ban_reason" TEXT,
    "dob" DATE,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(6),

    CONSTRAINT "users_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "wallet_transactions" (
    "transaction_id" SERIAL NOT NULL,
    "wallet_id" INTEGER NOT NULL,
    "type_code" VARCHAR(50) NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "reference_code" VARCHAR(100),
    "description" TEXT,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(6),

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("transaction_id")
);

-- CreateTable
CREATE TABLE "auctions" (
    "auction_id" SERIAL NOT NULL,
    "variant_id" INTEGER NOT NULL,
    "start_price" DECIMAL(15,2) NOT NULL,
    "step_price" DECIMAL(15,2) NOT NULL,
    "deposit_fee" DECIMAL(15,2) NOT NULL,
    "max_participants" INTEGER NOT NULL DEFAULT 50,
    "start_time" TIMESTAMP(6) NOT NULL,
    "end_time" TIMESTAMP(6) NOT NULL,
    "status_code" VARCHAR(50) NOT NULL DEFAULT 'DRAFT',
    "winner_id" INTEGER,
    "final_price" DECIMAL(15,2),
    "payment_deadline" TIMESTAMP(6),
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auctions_pkey" PRIMARY KEY ("auction_id")
);

-- CreateTable
CREATE TABLE "auction_participants" (
    "id" SERIAL NOT NULL,
    "auction_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "deposit_amount" DECIMAL(15,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'JOINED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auction_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auction_bids" (
    "bid_id" SERIAL NOT NULL,
    "auction_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "bid_amount" DECIMAL(15,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auction_bids_pkey" PRIMARY KEY ("bid_id")
);

-- CreateTable
CREATE TABLE "auction_chat_messages" (
    "message_id" SERIAL NOT NULL,
    "auction_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auction_chat_messages_pkey" PRIMARY KEY ("message_id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "wallet_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "balance_available" DECIMAL(15,2) DEFAULT 0,
    "balance_locked" DECIMAL(15,2) DEFAULT 0,
    "pin_code_hash" VARCHAR(255),
    "version" INTEGER DEFAULT 1,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(6),

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("wallet_id")
);

-- CreateTable
CREATE TABLE "work_schedules" (
    "schedule_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "shift_code" VARCHAR(20) NOT NULL,
    "status_code" VARCHAR(50) DEFAULT 'PUBLISHED',
    "expected_start" TIMESTAMP(6),
    "expected_end" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(6),

    CONSTRAINT "work_schedules_pkey" PRIMARY KEY ("schedule_id")
);

-- CreateTable
CREATE TABLE "employee_salary_configs" (
    "config_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "type_code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "is_recurring" BOOLEAN DEFAULT true,
    "effective_from" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "effective_to" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_salary_configs_pkey" PRIMARY KEY ("config_id")
);

-- CreateTable
CREATE TABLE "salary_change_histories" (
    "history_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "changed_by_id" INTEGER,
    "old_salary" DECIMAL(15,2) NOT NULL,
    "new_salary" DECIMAL(15,2) NOT NULL,
    "effective_date" DATE NOT NULL,
    "reason" VARCHAR(255),
    "note" TEXT,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "salary_change_histories_pkey" PRIMARY KEY ("history_id")
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
    "evidence_url" TEXT,

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

-- CreateTable
CREATE TABLE "livestreams" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "cover_url" TEXT,
    "start_time" TIMESTAMP(6),
    "end_time" TIMESTAMP(6),
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "pinned_product_id" INTEGER,
    "hearts_count" INTEGER NOT NULL DEFAULT 0,
    "shares_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(6),

    CONSTRAINT "livestreams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "livestream_products" (
    "id" SERIAL NOT NULL,
    "livestream_id" INTEGER NOT NULL,
    "variant_id" INTEGER NOT NULL,
    "live_price" DECIMAL(15,2),
    "flash_sale_price" DECIMAL(15,2),
    "flash_sale_stock" INTEGER DEFAULT 0,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "livestream_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "giveaway_claims" (
    "claim_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "variant_id" INTEGER NOT NULL,
    "livestream_id" INTEGER NOT NULL,
    "giveaway_id" INTEGER,
    "status_code" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(6),

    CONSTRAINT "giveaway_claims_pkey" PRIMARY KEY ("claim_id")
);

-- CreateTable
CREATE TABLE "livestream_giveaways" (
    "id" SERIAL NOT NULL,
    "livestream_id" INTEGER NOT NULL,
    "variant_id" INTEGER NOT NULL,
    "keyword" VARCHAR(100) NOT NULL,
    "slots_limit" INTEGER NOT NULL DEFAULT 100,
    "status_code" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "winner_user_id" INTEGER,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "livestream_giveaways_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "livestream_interactions" (
    "interaction_id" SERIAL NOT NULL,
    "livestream_id" INTEGER NOT NULL,
    "user_id" INTEGER,
    "type_code" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "livestream_interactions_pkey" PRIMARY KEY ("interaction_id")
);

-- CreateTable
CREATE TABLE "livestream_broadcast_messages" (
    "message_id" SERIAL NOT NULL,
    "livestream_id" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "livestream_broadcast_messages_pkey" PRIMARY KEY ("message_id")
);

-- CreateTable
CREATE TABLE "pii_access_logs" (
    "log_id" SERIAL NOT NULL,
    "accessed_by" INTEGER NOT NULL,
    "target_user_id" INTEGER NOT NULL,
    "fields_viewed" VARCHAR(255) NOT NULL,
    "ip_address" VARCHAR(45),
    "accessed_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pii_access_logs_pkey" PRIMARY KEY ("log_id")
);

-- CreateTable
CREATE TABLE "inventory_recommendations" (
    "id" SERIAL NOT NULL,
    "variant_id" INTEGER NOT NULL,
    "type" "RecommendationType" NOT NULL,
    "reason" TEXT NOT NULL,
    "suggested_action_value" VARCHAR(255),
    "status" "RecommendationStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "financial_note" TEXT,

    CONSTRAINT "inventory_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "id" SERIAL NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings_logs" (
    "id" SERIAL NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "old_value" JSONB,
    "new_value" JSONB,
    "user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_settings_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_intel" (
    "id" SERIAL NOT NULL,
    "brand" VARCHAR(100) NOT NULL,
    "product_name" VARCHAR(500) NOT NULL,
    "description" TEXT,
    "category" VARCHAR(100),
    "status" VARCHAR(50) NOT NULL,
    "release_date" VARCHAR(100),
    "source_url" TEXT NOT NULL,
    "source_title" VARCHAR(500),
    "confidence" VARCHAR(20) NOT NULL,
    "scanned_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_intel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_access_control_lookup" ON "access_controls"("role_code", "ip_address", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "brands_name_key" ON "brands"("name");

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "employees_employee_code_key" ON "employees"("employee_code");

-- CreateIndex
CREATE UNIQUE INDEX "feedbacks_user_id_product_id_order_id_key" ON "feedbacks"("user_id", "product_id", "order_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_order_code_key" ON "orders"("order_code");

-- CreateIndex
CREATE INDEX "idx_orders_code" ON "orders"("order_code");

-- CreateIndex
CREATE UNIQUE INDEX "payment_transactions_sepay_id_key" ON "payment_transactions"("sepay_id");

-- CreateIndex
CREATE INDEX "idx_payment_trx_order" ON "payment_transactions"("order_id");

-- CreateIndex
CREATE INDEX "idx_payment_trx_sepay" ON "payment_transactions"("sepay_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_preorder_configs_variant_id_key" ON "product_preorder_configs"("variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "preorder_contracts_order_code_key" ON "preorder_contracts"("order_code");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_sku_key" ON "product_variants"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_barcode_key" ON "product_variants"("barcode");

-- CreateIndex
CREATE INDEX "idx_variants_sku" ON "product_variants"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "promotions_code_key" ON "promotions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "series_name_key" ON "series"("name");

-- CreateIndex
CREATE UNIQUE INDEX "shipments_order_id_key" ON "shipments"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "system_configurations_config_key_key" ON "system_configurations"("config_key");

-- CreateIndex
CREATE INDEX "idx_lookup_type_code" ON "system_lookups"("type", "code");

-- CreateIndex
CREATE INDEX "idx_login_logs_ip" ON "user_login_logs"("ip_address");

-- CreateIndex
CREATE INDEX "idx_login_logs_time" ON "user_login_logs"("login_time");

-- CreateIndex
CREATE INDEX "idx_login_logs_user" ON "user_login_logs"("user_id");

-- CreateIndex
CREATE INDEX "user_vouchers_user_id_status_idx" ON "user_vouchers"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "user_vouchers_user_id_promotion_id_key" ON "user_vouchers"("user_id", "promotion_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_google_id_key" ON "users"("google_id");

-- CreateIndex
CREATE UNIQUE INDEX "auction_participants_auction_id_user_id_key" ON "auction_participants"("auction_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_user_id_key" ON "wallets"("user_id");

-- CreateIndex
CREATE INDEX "salary_change_histories_user_id_effective_date_idx" ON "salary_change_histories"("user_id", "effective_date");

-- CreateIndex
CREATE UNIQUE INDEX "livestream_products_livestream_id_variant_id_key" ON "livestream_products"("livestream_id", "variant_id");

-- CreateIndex
CREATE INDEX "idx_pii_log_accessor" ON "pii_access_logs"("accessed_by");

-- CreateIndex
CREATE INDEX "idx_pii_log_target" ON "pii_access_logs"("target_user_id");

-- CreateIndex
CREATE INDEX "idx_pii_log_time" ON "pii_access_logs"("accessed_at");

-- CreateIndex
CREATE INDEX "idx_recommendations_lookup" ON "inventory_recommendations"("variant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "system_settings_key_key" ON "system_settings"("key");

-- CreateIndex
CREATE INDEX "idx_market_intel_brand" ON "market_intel"("brand");

-- CreateIndex
CREATE INDEX "idx_market_intel_scanned_at" ON "market_intel"("scanned_at");

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "carts"("cart_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_livestream_id_fkey" FOREIGN KEY ("livestream_id") REFERENCES "livestreams"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("variant_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "carts" ADD CONSTRAINT "carts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("category_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "chat_sessions"("session_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "feedbacks" ADD CONSTRAINT "feedbacks_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("order_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "feedbacks" ADD CONSTRAINT "feedbacks_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "feedbacks" ADD CONSTRAINT "feedbacks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "inventory_logs" ADD CONSTRAINT "inventory_logs_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("variant_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "inventory_receipt_items" ADD CONSTRAINT "inventory_receipt_items_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "inventory_receipts"("receipt_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "inventory_receipt_items" ADD CONSTRAINT "inventory_receipt_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("variant_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "inventory_receipts" ADD CONSTRAINT "inventory_receipts_warehouse_staff_id_fkey" FOREIGN KEY ("warehouse_staff_id") REFERENCES "employees"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_allocated_product_id_fkey" FOREIGN KEY ("allocated_product_id") REFERENCES "product_variants"("variant_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("order_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("variant_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("order_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_staff_id_fkey" FOREIGN KEY ("created_by_staff_id") REFERENCES "employees"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_packed_by_staff_id_fkey" FOREIGN KEY ("packed_by_staff_id") REFERENCES "employees"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_promotion_id_fkey" FOREIGN KEY ("promotion_id") REFERENCES "promotions"("promotion_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "pos_sessions"("session_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_shipping_address_id_fkey" FOREIGN KEY ("shipping_address_id") REFERENCES "addresses"("address_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_shipping_promotion_id_fkey" FOREIGN KEY ("shipping_promotion_id") REFERENCES "promotions"("promotion_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("order_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "employees"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "employees"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "employees"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "pos_sessions" ADD CONSTRAINT "pos_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "employees"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "product_blindboxes" ADD CONSTRAINT "product_blindboxes_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "product_preorder_configs" ADD CONSTRAINT "product_preorder_configs_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("variant_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preorder_contracts" ADD CONSTRAINT "preorder_contracts_deposit_order_id_fkey" FOREIGN KEY ("deposit_order_id") REFERENCES "orders"("order_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preorder_contracts" ADD CONSTRAINT "preorder_contracts_final_payment_order_id_fkey" FOREIGN KEY ("final_payment_order_id") REFERENCES "orders"("order_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preorder_contracts" ADD CONSTRAINT "preorder_contracts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preorder_contracts" ADD CONSTRAINT "preorder_contracts_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("variant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("brand_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("category_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "series"("series_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_promotion_id_fkey" FOREIGN KEY ("product_promotion_id") REFERENCES "product_promotions"("promotion_id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "profile_update_requests" ADD CONSTRAINT "profile_update_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "promotion_items" ADD CONSTRAINT "promotion_items_promotion_id_fkey" FOREIGN KEY ("promotion_id") REFERENCES "product_promotions"("promotion_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_items" ADD CONSTRAINT "promotion_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("variant_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("item_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "return_requests"("return_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("order_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_processed_by_staff_id_fkey" FOREIGN KEY ("processed_by_staff_id") REFERENCES "employees"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("order_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "store_expenses" ADD CONSTRAINT "store_expenses_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "pos_sessions"("session_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "store_expenses" ADD CONSTRAINT "store_expenses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "employees"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "work_schedules"("schedule_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_login_logs" ADD CONSTRAINT "user_login_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_vouchers" ADD CONSTRAINT "user_vouchers_promotion_id_fkey" FOREIGN KEY ("promotion_id") REFERENCES "promotions"("promotion_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_vouchers" ADD CONSTRAINT "user_vouchers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("wallet_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "auctions" ADD CONSTRAINT "auctions_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("variant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auctions" ADD CONSTRAINT "auctions_winner_id_fkey" FOREIGN KEY ("winner_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auction_participants" ADD CONSTRAINT "auction_participants_auction_id_fkey" FOREIGN KEY ("auction_id") REFERENCES "auctions"("auction_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auction_participants" ADD CONSTRAINT "auction_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auction_bids" ADD CONSTRAINT "auction_bids_auction_id_fkey" FOREIGN KEY ("auction_id") REFERENCES "auctions"("auction_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auction_bids" ADD CONSTRAINT "auction_bids_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auction_chat_messages" ADD CONSTRAINT "auction_chat_messages_auction_id_fkey" FOREIGN KEY ("auction_id") REFERENCES "auctions"("auction_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auction_chat_messages" ADD CONSTRAINT "auction_chat_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "work_schedules" ADD CONSTRAINT "work_schedules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "employees"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee_salary_configs" ADD CONSTRAINT "employee_salary_configs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "employees"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "salary_change_histories" ADD CONSTRAINT "salary_change_histories_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "salary_change_histories" ADD CONSTRAINT "salary_change_histories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "employees"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_payroll_id_fkey" FOREIGN KEY ("payroll_id") REFERENCES "payrolls"("payroll_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "employees"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payroll_disputes" ADD CONSTRAINT "payroll_disputes_payroll_id_fkey" FOREIGN KEY ("payroll_id") REFERENCES "payrolls"("payroll_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payroll_disputes" ADD CONSTRAINT "payroll_disputes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "employees"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "timesheet_corrections" ADD CONSTRAINT "timesheet_corrections_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "employees"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "timesheet_corrections" ADD CONSTRAINT "timesheet_corrections_timesheet_id_fkey" FOREIGN KEY ("timesheet_id") REFERENCES "timesheets"("timesheet_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "timesheet_corrections" ADD CONSTRAINT "timesheet_corrections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "employees"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "livestream_products" ADD CONSTRAINT "livestream_products_livestream_id_fkey" FOREIGN KEY ("livestream_id") REFERENCES "livestreams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "livestream_products" ADD CONSTRAINT "livestream_products_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("variant_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "giveaway_claims" ADD CONSTRAINT "giveaway_claims_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "giveaway_claims" ADD CONSTRAINT "giveaway_claims_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("variant_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "giveaway_claims" ADD CONSTRAINT "giveaway_claims_livestream_id_fkey" FOREIGN KEY ("livestream_id") REFERENCES "livestreams"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "giveaway_claims" ADD CONSTRAINT "giveaway_claims_giveaway_id_fkey" FOREIGN KEY ("giveaway_id") REFERENCES "livestream_giveaways"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "livestream_giveaways" ADD CONSTRAINT "livestream_giveaways_livestream_id_fkey" FOREIGN KEY ("livestream_id") REFERENCES "livestreams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "livestream_giveaways" ADD CONSTRAINT "livestream_giveaways_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("variant_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "livestream_giveaways" ADD CONSTRAINT "livestream_giveaways_winner_user_id_fkey" FOREIGN KEY ("winner_user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "livestream_interactions" ADD CONSTRAINT "livestream_interactions_livestream_id_fkey" FOREIGN KEY ("livestream_id") REFERENCES "livestreams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "livestream_interactions" ADD CONSTRAINT "livestream_interactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "livestream_broadcast_messages" ADD CONSTRAINT "livestream_broadcast_messages_livestream_id_fkey" FOREIGN KEY ("livestream_id") REFERENCES "livestreams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pii_access_logs" ADD CONSTRAINT "pii_access_logs_accessed_by_fkey" FOREIGN KEY ("accessed_by") REFERENCES "users"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "pii_access_logs" ADD CONSTRAINT "pii_access_logs_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "inventory_recommendations" ADD CONSTRAINT "inventory_recommendations_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("variant_id") ON DELETE CASCADE ON UPDATE CASCADE;

