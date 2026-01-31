-- CreateTable
CREATE TABLE "addresses" (
    "address_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "recipient_name" VARCHAR(100) NOT NULL,
    "recipient_phone" VARCHAR(15) NOT NULL,
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
CREATE TABLE "auction_bids" (
    "bid_id" SERIAL NOT NULL,
    "auction_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "bid_amount" DECIMAL(15,2) NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(6),

    CONSTRAINT "auction_bids_pkey" PRIMARY KEY ("bid_id")
);

-- CreateTable
CREATE TABLE "auction_participants" (
    "id" SERIAL NOT NULL,
    "auction_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "deposit_amount" DECIMAL(15,2) NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(6),

    CONSTRAINT "auction_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auctions" (
    "auction_id" SERIAL NOT NULL,
    "product_id" INTEGER NOT NULL,
    "start_price" DECIMAL(15,2) NOT NULL,
    "current_price" DECIMAL(15,2),
    "start_time" TIMESTAMP(6) NOT NULL,
    "end_time" TIMESTAMP(6) NOT NULL,
    "status_code" VARCHAR(20) DEFAULT 'PENDING',
    "winner_id" INTEGER,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(6),

    CONSTRAINT "auctions_pkey" PRIMARY KEY ("auction_id")
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
    "quantity" INTEGER DEFAULT 1,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(6),

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
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(15,2) NOT NULL,
    "total_price" DECIMAL(15,2) NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(6),

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
    "total_amount" DECIMAL(15,2) NOT NULL,
    "paid_amount" DECIMAL(15,2) DEFAULT 0,
    "discount_amount" DECIMAL(15,2) DEFAULT 0,
    "shipping_fee" DECIMAL(15,2) DEFAULT 0,
    "original_shipping_fee" DECIMAL(15,2) DEFAULT 0,
    "payment_deadline" TIMESTAMP(6),
    "channel_code" VARCHAR(20) NOT NULL,
    "payment_method_code" VARCHAR(20),
    "status_code" VARCHAR(50) DEFAULT 'PENDING',
    "packing_video_urls" JSONB,
    "packed_at" TIMESTAMP(6),
    "note" TEXT,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(6),

    CONSTRAINT "orders_pkey" PRIMARY KEY ("order_id")
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
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(6),

    CONSTRAINT "product_blindboxes_pkey" PRIMARY KEY ("product_id")
);

-- CreateTable
CREATE TABLE "product_preorders" (
    "product_id" INTEGER NOT NULL,
    "deposit_amount" DECIMAL(15,2),
    "full_price" DECIMAL(15,2) DEFAULT 0,
    "release_date" TIMESTAMP(6),
    "max_slots" INTEGER,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(6),

    CONSTRAINT "product_preorders_pkey" PRIMARY KEY ("product_id")
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
    "stock_available" INTEGER NOT NULL DEFAULT 0,
    "stock_defect" INTEGER NOT NULL DEFAULT 0,
    "barcode" VARCHAR(50),
    "media_assets" JSONB DEFAULT '[]',
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(6),

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
CREATE TABLE "promotions" (
    "promotion_id" SERIAL NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "discount_value" DECIMAL(15,2),
    "discount_type" VARCHAR(20),
    "min_order_value" DECIMAL(15,2) DEFAULT 0,
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
    "status_code" VARCHAR(20) DEFAULT 'PENDING',
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
    "is_used" BOOLEAN DEFAULT false,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(6),

    CONSTRAINT "user_vouchers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "user_id" SERIAL NOT NULL,
    "phone" VARCHAR(15),
    "email" VARCHAR(100),
    "password_hash" VARCHAR(255),
    "full_name" VARCHAR(100) NOT NULL,
    "avatar_url" TEXT,
    "role_code" VARCHAR(50) NOT NULL,
    "status_code" VARCHAR(50) DEFAULT 'ACTIVE',
    "is_verified" BOOLEAN DEFAULT false,
    "google_id" VARCHAR(100),
    "otp_code" VARCHAR(10),
    "otp_expires_at" TIMESTAMP(6),
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
    "expected_start" TIME(6),
    "expected_end" TIME(6),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(6),

    CONSTRAINT "work_schedules_pkey" PRIMARY KEY ("schedule_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_auction_bid_amount" ON "auction_bids"("auction_id", "bid_amount");

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
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_google_id_key" ON "users"("google_id");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_user_id_key" ON "wallets"("user_id");

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "auction_bids" ADD CONSTRAINT "auction_bids_auction_id_fkey" FOREIGN KEY ("auction_id") REFERENCES "auctions"("auction_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "auction_bids" ADD CONSTRAINT "auction_bids_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "auction_participants" ADD CONSTRAINT "auction_participants_auction_id_fkey" FOREIGN KEY ("auction_id") REFERENCES "auctions"("auction_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "auction_participants" ADD CONSTRAINT "auction_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "auctions" ADD CONSTRAINT "auctions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "auctions" ADD CONSTRAINT "auctions_winner_id_fkey" FOREIGN KEY ("winner_id") REFERENCES "users"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "carts"("cart_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

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
ALTER TABLE "inventory_receipt_items" ADD CONSTRAINT "inventory_receipt_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("variant_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "inventory_receipt_items" ADD CONSTRAINT "inventory_receipt_items_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "inventory_receipts"("receipt_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "inventory_receipts" ADD CONSTRAINT "inventory_receipts_warehouse_staff_id_fkey" FOREIGN KEY ("warehouse_staff_id") REFERENCES "employees"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("order_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("variant_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("order_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_staff_id_fkey" FOREIGN KEY ("created_by_staff_id") REFERENCES "employees"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_promotion_id_fkey" FOREIGN KEY ("promotion_id") REFERENCES "promotions"("promotion_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "pos_sessions"("session_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_shipping_address_id_fkey" FOREIGN KEY ("shipping_address_id") REFERENCES "addresses"("address_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "employees"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "pos_sessions" ADD CONSTRAINT "pos_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "employees"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "product_blindboxes" ADD CONSTRAINT "product_blindboxes_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "product_preorders" ADD CONSTRAINT "product_preorders_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("brand_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("category_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "series"("series_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "profile_update_requests" ADD CONSTRAINT "profile_update_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("item_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "return_requests"("return_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("order_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

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
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "work_schedules" ADD CONSTRAINT "work_schedules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "employees"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
