-- Phase 2: Credit flow enhancements
-- • PaymentMethod enum: add CARD, PAGO_EXPRESS, AQUI_PAGO, CHECK
-- • AdvancePaymentMode enum: new
-- • Customer: add credit_limit
-- • CreditConfig: add mora_rate
-- • Installment: add mora_amount, last_mora_calculated_at
-- • DownPayment: new table

BEGIN;

-- ─── PaymentMethod enum — add new values ─────────────────────────────────────
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'CARD';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'PAGO_EXPRESS';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'AQUI_PAGO';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'CHECK';

-- ─── AdvancePaymentMode enum ─────────────────────────────────────────────────
DO $$ BEGIN
    CREATE TYPE "AdvancePaymentMode" AS ENUM ('REDUCE_INSTALLMENTS', 'REDUCE_AMOUNT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── Customer: credit limit ───────────────────────────────────────────────────
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "credit_limit" DECIMAL(12, 2);

-- ─── CreditConfig: mora rate ─────────────────────────────────────────────────
ALTER TABLE "credit_configs" ADD COLUMN IF NOT EXISTS "mora_rate" DECIMAL(5, 2) NOT NULL DEFAULT 0;

-- ─── Installment: mora tracking ──────────────────────────────────────────────
ALTER TABLE "installments" ADD COLUMN IF NOT EXISTS "mora_amount" DECIMAL(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE "installments" ADD COLUMN IF NOT EXISTS "last_mora_calculated_at" TIMESTAMP(3);

-- ─── DownPayment table ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "down_payments" (
    "id"               TEXT NOT NULL,
    "tenant_id"        TEXT NOT NULL,
    "sale_order_id"    TEXT NOT NULL,
    "amount"           DECIMAL(12, 2) NOT NULL,
    "payment_method"   "PaymentMethod" NOT NULL,
    "payment_date"     TIMESTAMP(3) NOT NULL,
    "reference"        TEXT,
    "notes"            TEXT,
    "registered_by_id" TEXT,
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "down_payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "down_payments_sale_order_id_key"
    ON "down_payments"("sale_order_id");

ALTER TABLE "down_payments"
    ADD CONSTRAINT "down_payments_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "down_payments"
    ADD CONSTRAINT "down_payments_sale_order_id_fkey"
    FOREIGN KEY ("sale_order_id") REFERENCES "sale_orders"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "down_payments"
    ADD CONSTRAINT "down_payments_registered_by_id_fkey"
    FOREIGN KEY ("registered_by_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
