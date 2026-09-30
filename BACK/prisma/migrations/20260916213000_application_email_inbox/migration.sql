CREATE TABLE "app_email_inbox_messages" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "mailbox" TEXT NOT NULL,
    "uid" TEXT NOT NULL,
    "message_id" TEXT,
    "sender_name" TEXT,
    "sender_email" TEXT NOT NULL,
    "recipients" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body_text" TEXT NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "starred" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_email_inbox_messages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "app_email_inbox_messages_tenant_id_mailbox_uid_key"
ON "app_email_inbox_messages"("tenant_id", "mailbox", "uid");

CREATE INDEX "app_email_inbox_messages_tenant_id_received_at_idx"
ON "app_email_inbox_messages"("tenant_id", "received_at");

ALTER TABLE "app_email_inbox_messages"
ADD CONSTRAINT "app_email_inbox_messages_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
