-- Additive first increment. Legacy email tables and integration credentials are retained.
CREATE TYPE "CommunicationMessageStatus" AS ENUM ('QUEUED', 'PROCESSING', 'SENT', 'FAILED', 'UNKNOWN');

CREATE TABLE "communication_settings" (
  "tenant_id" TEXT NOT NULL PRIMARY KEY,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "email_enabled" BOOLEAN NOT NULL DEFAULT false,
  "invoice_email_enabled" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "communication_identities" (
  "id" TEXT NOT NULL PRIMARY KEY, "tenant_id" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'SYSTEM', "name" TEXT,
  "from_email" TEXT NOT NULL, "from_name" TEXT, "reply_to" TEXT,
  "outbound_enabled" BOOLEAN NOT NULL DEFAULT false,
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "communication_template_versions" (
  "id" TEXT NOT NULL PRIMARY KEY, "tenant_id" TEXT NOT NULL,
  "code" TEXT NOT NULL, "version" INTEGER NOT NULL,
  "subject" TEXT NOT NULL, "body_text" TEXT NOT NULL, "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "communication_messages" (
  "id" TEXT NOT NULL PRIMARY KEY, "tenant_id" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL DEFAULT 'INVOICE', "entity_id" TEXT NOT NULL,
  "invoice_id" TEXT NOT NULL, "recipient" TEXT NOT NULL,
  "pdf_file_id" TEXT NOT NULL, "identity_id" TEXT NOT NULL,
  "template_version_id" TEXT NOT NULL, "subject" TEXT NOT NULL, "body_text" TEXT NOT NULL,
  "from_email" TEXT NOT NULL, "from_name" TEXT, "reply_to" TEXT,
  "status" "CommunicationMessageStatus" NOT NULL DEFAULT 'QUEUED',
  "idempotency_key" TEXT NOT NULL, "requested_by" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "locked_at" TIMESTAMP(3), "sent_at" TIMESTAMP(3), "last_error" TEXT,
  "provider_message_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "communication_delivery_attempts" (
  "id" TEXT NOT NULL PRIMARY KEY, "tenant_id" TEXT NOT NULL, "message_id" TEXT NOT NULL,
  "attempt" INTEGER NOT NULL, "status" TEXT NOT NULL, "error_code" TEXT, "error_message" TEXT,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "finished_at" TIMESTAMP(3)
);
CREATE TABLE "communication_notes" (
  "id" TEXT NOT NULL PRIMARY KEY, "tenant_id" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL, "entity_id" TEXT NOT NULL,
  "body" TEXT NOT NULL, "created_by" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "communication_notifications" (
  "id" TEXT NOT NULL PRIMARY KEY, "tenant_id" TEXT NOT NULL, "user_id" TEXT NOT NULL,
  "message_id" TEXT, "title" TEXT NOT NULL, "body" TEXT, "read_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "idempotency_key" TEXT NOT NULL
);
CREATE INDEX "communication_identities_tenant_id_is_default_idx" ON "communication_identities"("tenant_id", "is_default");
CREATE UNIQUE INDEX "communication_identities_tenant_id_from_email_key" ON "communication_identities"("tenant_id", "from_email");
CREATE UNIQUE INDEX "communication_template_versions_tenant_id_code_version_key" ON "communication_template_versions"("tenant_id", "code", "version");
CREATE INDEX "communication_messages_tenant_id_entity_type_entity_id_crea_idx" ON "communication_messages"("tenant_id", "entity_type", "entity_id", "created_at");
CREATE INDEX "communication_messages_status_available_at_idx" ON "communication_messages"("status", "available_at");
CREATE INDEX "communication_messages_status_locked_at_idx" ON "communication_messages"("status", "locked_at");
CREATE UNIQUE INDEX "communication_messages_tenant_id_idempotency_key_key" ON "communication_messages"("tenant_id", "idempotency_key");
CREATE UNIQUE INDEX "communication_delivery_attempts_tenant_id_message_id_attemp_key" ON "communication_delivery_attempts"("tenant_id", "message_id", "attempt");
CREATE INDEX "communication_notes_tenant_id_entity_type_entity_id_created_idx" ON "communication_notes"("tenant_id", "entity_type", "entity_id", "created_at");
CREATE INDEX "communication_notifications_tenant_id_user_id_read_at_creat_idx" ON "communication_notifications"("tenant_id", "user_id", "read_at", "created_at");
CREATE UNIQUE INDEX "communication_notifications_tenant_id_idempotency_key_key" ON "communication_notifications"("tenant_id", "idempotency_key");

-- New privileges are granted to system owner roles only. Existing application
-- users must be explicitly assigned access by an owner (no privilege expansion).
INSERT INTO "permissions" ("id", "key") VALUES
  ('communications-access-v1', 'communications:access'),
  ('communications-settings-v1', 'communications:settings:manage'),
  ('communications-send-v1', 'communications:email:send'),
  ('communications-delivery-v1', 'communications:delivery:read'),
  ('communications-notes-v1', 'communications:notes:create')
ON CONFLICT ("key") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id FROM "roles" r CROSS JOIN "permissions" p
WHERE r.is_system = true AND p.key IN (
  'communications:access', 'communications:settings:manage', 'communications:email:send',
  'communications:delivery:read', 'communications:notes:create'
)
ON CONFLICT DO NOTHING;
