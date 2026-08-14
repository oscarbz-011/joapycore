-- SalePayment: allow multiple payment records per sale order
-- Previously had @unique on sale_order_id which only allowed one payment method.
-- Removing unique index and replacing with a composite index for tenant-scoped queries.

DROP INDEX IF EXISTS "sale_payments_sale_order_id_key";

CREATE INDEX IF NOT EXISTS "sale_payments_tenant_id_sale_order_id_idx"
  ON "sale_payments"("tenant_id", "sale_order_id");
