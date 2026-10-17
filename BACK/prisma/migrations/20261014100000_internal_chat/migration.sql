CREATE TABLE "chat_conversations" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'DIRECT',
    "name" TEXT,
    "direct_key" TEXT,
    "created_by" TEXT NOT NULL,
    "last_message_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_conversations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "chat_participants" (
    "conversation_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "last_read_at" TIMESTAMP(3),
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_participants_pkey" PRIMARY KEY ("conversation_id","user_id")
);

CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "chat_conversations_tenant_id_direct_key_key" ON "chat_conversations"("tenant_id", "direct_key");
CREATE INDEX "chat_conversations_tenant_id_last_message_at_idx" ON "chat_conversations"("tenant_id", "last_message_at");
CREATE INDEX "chat_participants_tenant_id_user_id_idx" ON "chat_participants"("tenant_id", "user_id");
CREATE INDEX "chat_messages_tenant_id_conversation_id_created_at_idx" ON "chat_messages"("tenant_id", "conversation_id", "created_at");
