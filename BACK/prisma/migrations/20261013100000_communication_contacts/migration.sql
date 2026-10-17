ALTER TABLE "communication_messages" ADD COLUMN "contact_type" TEXT, ADD COLUMN "contact_id" TEXT;
ALTER TABLE "communication_notes" ADD COLUMN "contact_type" TEXT, ADD COLUMN "contact_id" TEXT;

UPDATE "communication_messages" m
SET "contact_type" = 'CUSTOMER', "contact_id" = so."customer_id"
FROM "invoices" i
JOIN "sale_orders" so ON so."id" = i."sale_order_id" AND so."tenant_id" = i."tenant_id"
WHERE i."id" = m."invoice_id" AND i."tenant_id" = m."tenant_id";

UPDATE "communication_notes" n
SET "contact_type" = 'CUSTOMER', "contact_id" = so."customer_id"
FROM "invoices" i
JOIN "sale_orders" so ON so."id" = i."sale_order_id" AND so."tenant_id" = i."tenant_id"
WHERE n."entity_type" = 'INVOICE' AND i."id" = n."entity_id" AND i."tenant_id" = n."tenant_id";

CREATE INDEX "communication_messages_tenant_id_contact_type_contact_id_cr_idx" ON "communication_messages"("tenant_id", "contact_type", "contact_id", "created_at");
CREATE INDEX "communication_notes_tenant_id_contact_type_contact_id_creat_idx" ON "communication_notes"("tenant_id", "contact_type", "contact_id", "created_at");
