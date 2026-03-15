-- CreateTable
CREATE TABLE "auction_chat_messages" (
    "message_id" SERIAL NOT NULL,
    "auction_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auction_chat_messages_pkey" PRIMARY KEY ("message_id")
);

-- AddForeignKey
ALTER TABLE "auction_chat_messages" ADD CONSTRAINT "auction_chat_messages_auction_id_fkey" FOREIGN KEY ("auction_id") REFERENCES "auctions"("auction_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auction_chat_messages" ADD CONSTRAINT "auction_chat_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
