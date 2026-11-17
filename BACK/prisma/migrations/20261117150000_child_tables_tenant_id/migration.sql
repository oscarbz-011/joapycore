-- invoice_items: la empresa sale de invoices
ALTER TABLE "invoice_items" ADD COLUMN "tenant_id" TEXT;
UPDATE "invoice_items" AS c SET "tenant_id" = p."tenant_id" FROM "invoices" AS p WHERE c."invoice_id" = p."id";
ALTER TABLE "invoice_items" ALTER COLUMN "tenant_id" SET NOT NULL;
CREATE INDEX "invoice_items_tenant_id_idx" ON "invoice_items"("tenant_id");

-- credit_note_items: la empresa sale de credit_notes
ALTER TABLE "credit_note_items" ADD COLUMN "tenant_id" TEXT;
UPDATE "credit_note_items" AS c SET "tenant_id" = p."tenant_id" FROM "credit_notes" AS p WHERE c."credit_note_id" = p."id";
ALTER TABLE "credit_note_items" ALTER COLUMN "tenant_id" SET NOT NULL;
CREATE INDEX "credit_note_items_tenant_id_idx" ON "credit_note_items"("tenant_id");

-- remission_note_items: la empresa sale de remission_notes
ALTER TABLE "remission_note_items" ADD COLUMN "tenant_id" TEXT;
UPDATE "remission_note_items" AS c SET "tenant_id" = p."tenant_id" FROM "remission_notes" AS p WHERE c."remission_note_id" = p."id";
ALTER TABLE "remission_note_items" ALTER COLUMN "tenant_id" SET NOT NULL;
CREATE INDEX "remission_note_items_tenant_id_idx" ON "remission_note_items"("tenant_id");

-- installment_interest_charges: la empresa sale de installments
ALTER TABLE "installment_interest_charges" ADD COLUMN "tenant_id" TEXT;
UPDATE "installment_interest_charges" AS c SET "tenant_id" = p."tenant_id" FROM "installments" AS p WHERE c."installment_id" = p."id";
ALTER TABLE "installment_interest_charges" ALTER COLUMN "tenant_id" SET NOT NULL;
CREATE INDEX "installment_interest_charges_tenant_id_idx" ON "installment_interest_charges"("tenant_id");

-- payment_receipt_items: la empresa sale de payment_receipts
ALTER TABLE "payment_receipt_items" ADD COLUMN "tenant_id" TEXT;
UPDATE "payment_receipt_items" AS c SET "tenant_id" = p."tenant_id" FROM "payment_receipts" AS p WHERE c."receipt_id" = p."id";
ALTER TABLE "payment_receipt_items" ALTER COLUMN "tenant_id" SET NOT NULL;
CREATE INDEX "payment_receipt_items_tenant_id_idx" ON "payment_receipt_items"("tenant_id");

-- payroll_record_items: la empresa sale de payroll_records
ALTER TABLE "payroll_record_items" ADD COLUMN "tenant_id" TEXT;
UPDATE "payroll_record_items" AS c SET "tenant_id" = p."tenant_id" FROM "payroll_records" AS p WHERE c."payroll_record_id" = p."id";
ALTER TABLE "payroll_record_items" ALTER COLUMN "tenant_id" SET NOT NULL;
CREATE INDEX "payroll_record_items_tenant_id_idx" ON "payroll_record_items"("tenant_id");

-- purchase_order_items: la empresa sale de purchase_orders
ALTER TABLE "purchase_order_items" ADD COLUMN "tenant_id" TEXT;
UPDATE "purchase_order_items" AS c SET "tenant_id" = p."tenant_id" FROM "purchase_orders" AS p WHERE c."purchase_order_id" = p."id";
ALTER TABLE "purchase_order_items" ALTER COLUMN "tenant_id" SET NOT NULL;
CREATE INDEX "purchase_order_items_tenant_id_idx" ON "purchase_order_items"("tenant_id");

-- purchase_receipt_items: la empresa sale de purchase_receipts
ALTER TABLE "purchase_receipt_items" ADD COLUMN "tenant_id" TEXT;
UPDATE "purchase_receipt_items" AS c SET "tenant_id" = p."tenant_id" FROM "purchase_receipts" AS p WHERE c."purchase_receipt_id" = p."id";
ALTER TABLE "purchase_receipt_items" ALTER COLUMN "tenant_id" SET NOT NULL;
CREATE INDEX "purchase_receipt_items_tenant_id_idx" ON "purchase_receipt_items"("tenant_id");

-- supplier_invoice_items: la empresa sale de supplier_invoices
ALTER TABLE "supplier_invoice_items" ADD COLUMN "tenant_id" TEXT;
UPDATE "supplier_invoice_items" AS c SET "tenant_id" = p."tenant_id" FROM "supplier_invoices" AS p WHERE c."supplier_invoice_id" = p."id";
ALTER TABLE "supplier_invoice_items" ALTER COLUMN "tenant_id" SET NOT NULL;
CREATE INDEX "supplier_invoice_items_tenant_id_idx" ON "supplier_invoice_items"("tenant_id");

-- production_order_items: la empresa sale de production_orders
ALTER TABLE "production_order_items" ADD COLUMN "tenant_id" TEXT;
UPDATE "production_order_items" AS c SET "tenant_id" = p."tenant_id" FROM "production_orders" AS p WHERE c."production_order_id" = p."id";
ALTER TABLE "production_order_items" ALTER COLUMN "tenant_id" SET NOT NULL;
CREATE INDEX "production_order_items_tenant_id_idx" ON "production_order_items"("tenant_id");

-- sale_order_items: la empresa sale de sale_orders
ALTER TABLE "sale_order_items" ADD COLUMN "tenant_id" TEXT;
UPDATE "sale_order_items" AS c SET "tenant_id" = p."tenant_id" FROM "sale_orders" AS p WHERE c."sale_order_id" = p."id";
ALTER TABLE "sale_order_items" ALTER COLUMN "tenant_id" SET NOT NULL;
CREATE INDEX "sale_order_items_tenant_id_idx" ON "sale_order_items"("tenant_id");

-- sale_combo_items: la empresa sale de sale_combos
ALTER TABLE "sale_combo_items" ADD COLUMN "tenant_id" TEXT;
UPDATE "sale_combo_items" AS c SET "tenant_id" = p."tenant_id" FROM "sale_combos" AS p WHERE c."combo_id" = p."id";
ALTER TABLE "sale_combo_items" ALTER COLUMN "tenant_id" SET NOT NULL;
CREATE INDEX "sale_combo_items_tenant_id_idx" ON "sale_combo_items"("tenant_id");

-- user_permissions: la empresa sale de users
ALTER TABLE "user_permissions" ADD COLUMN "tenant_id" TEXT;
UPDATE "user_permissions" AS c SET "tenant_id" = p."tenant_id" FROM "users" AS p WHERE c."user_id" = p."id";
ALTER TABLE "user_permissions" ALTER COLUMN "tenant_id" SET NOT NULL;
CREATE INDEX "user_permissions_tenant_id_idx" ON "user_permissions"("tenant_id");

-- role_permissions: la empresa sale de roles
ALTER TABLE "role_permissions" ADD COLUMN "tenant_id" TEXT;
UPDATE "role_permissions" AS c SET "tenant_id" = p."tenant_id" FROM "roles" AS p WHERE c."role_id" = p."id";
ALTER TABLE "role_permissions" ALTER COLUMN "tenant_id" SET NOT NULL;
CREATE INDEX "role_permissions_tenant_id_idx" ON "role_permissions"("tenant_id");

-- user_roles: la empresa sale de users
ALTER TABLE "user_roles" ADD COLUMN "tenant_id" TEXT;
UPDATE "user_roles" AS c SET "tenant_id" = p."tenant_id" FROM "users" AS p WHERE c."user_id" = p."id";
ALTER TABLE "user_roles" ALTER COLUMN "tenant_id" SET NOT NULL;
CREATE INDEX "user_roles_tenant_id_idx" ON "user_roles"("tenant_id");

-- credit_plans: la empresa sale de credit_configs
ALTER TABLE "credit_plans" ADD COLUMN "tenant_id" TEXT;
UPDATE "credit_plans" AS c SET "tenant_id" = p."tenant_id" FROM "credit_configs" AS p WHERE c."credit_config_id" = p."id";
ALTER TABLE "credit_plans" ALTER COLUMN "tenant_id" SET NOT NULL;
CREATE INDEX "credit_plans_tenant_id_idx" ON "credit_plans"("tenant_id");

-- outbox_deliveries: la empresa sale de outbox_events
ALTER TABLE "outbox_deliveries" ADD COLUMN "tenant_id" TEXT;
UPDATE "outbox_deliveries" AS c SET "tenant_id" = p."tenant_id" FROM "outbox_events" AS p WHERE c."event_id" = p."id";
ALTER TABLE "outbox_deliveries" ALTER COLUMN "tenant_id" SET NOT NULL;
CREATE INDEX "outbox_deliveries_tenant_id_idx" ON "outbox_deliveries"("tenant_id");
