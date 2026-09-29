ALTER TABLE "app_email_inbox_messages"
ADD COLUMN "uid_validity" TEXT;

-- Existing rows predate UIDVALIDITY tracking. Keep them readable until the
-- first authoritative sync replaces the mailbox cache with a real epoch.
UPDATE "app_email_inbox_messages"
SET "uid_validity" = 'legacy'
WHERE "uid_validity" IS NULL;

ALTER TABLE "app_email_inbox_messages"
ALTER COLUMN "uid_validity" SET NOT NULL;

DROP INDEX "app_email_inbox_messages_tenant_id_mailbox_uid_key";

CREATE UNIQUE INDEX "app_email_inbox_epoch_uid_key"
ON "app_email_inbox_messages"("tenant_id", "mailbox", "uid_validity", "uid");
