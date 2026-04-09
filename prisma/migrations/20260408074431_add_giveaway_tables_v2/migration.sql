-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "target_url" TEXT;

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
