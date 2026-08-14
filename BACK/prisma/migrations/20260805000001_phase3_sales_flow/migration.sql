-- Phase 3: Sales flow redesign
-- • SaleOrderStatus: add PAYMENT_RECEIVED
-- • StockMovementType: add RESERVED
-- • DeliveryNoteStatus: new enum
-- • SalePayment: cash payment record before dispatch
-- • DeliveryNote: guía de remisión

BEGIN;

-- ─── SaleOrderStatus enum ─────────────────────────────────────────────────────
ALTER TYPE "SaleOrderStatus" ADD VALUE IF NOT EXISTS 'PAYMENT_RECEIVED';

-- ─── StockMovementType enum ───────────────────────────────────────────────────
ALTER TYPE "StockMovementType" ADD VALUE IF NOT EXISTS 'RESERVED';

-- ─── DeliveryNoteStatus enum ──────────────────────────────────────────────────
DO $$ BEGIN
    CREATE TYPE "DeliveryNoteStatus" AS ENUM ('PENDING', 'DISPATCHED', 'DELIVERED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── SalePayment table ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "sale_payments" (
    "id"              TEXT NOT NULL,
    "tenant_id"       TEXT NOT NULL,
    "sale_order_id"   TEXT NOT NULL,
    "amount"          DECIMAL(12, 2) NOT NULL,
    "payment_method"  "PaymentMethod" NOT NULL,
    "payment_date"    TIMESTAMP(3) NOT NULL,
    "reference"       TEXT,
    "notes"           TEXT,
    "collected_by_id" TEXT,
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sale_payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "sale_payments_sale_order_id_key"
    ON "sale_payments"("sale_order_id");

ALTER TABLE "sale_payments"
    ADD CONSTRAINT "sale_payments_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sale_payments"
    ADD CONSTRAINT "sale_payments_sale_order_id_fkey"
    FOREIGN KEY ("sale_order_id") REFERENCES "sale_orders"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sale_payments"
    ADD CONSTRAINT "sale_payments_collected_by_id_fkey"
    FOREIGN KEY ("collected_by_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── DeliveryNote table ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "delivery_notes" (
    "id"            TEXT NOT NULL,
    "tenant_id"     TEXT NOT NULL,
    "sale_order_id" TEXT NOT NULL,
    "note_number"   TEXT,
    "carrier"       TEXT,
    "vehicle"       TEXT,
    "status"        "DeliveryNoteStatus" NOT NULL DEFAULT 'PENDING',
    "issued_at"     TIMESTAMP(3),
    "delivered_at"  TIMESTAMP(3),
    "notes"         TEXT,
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "delivery_notes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "delivery_notes_sale_order_id_key"
    ON "delivery_notes"("sale_order_id");

ALTER TABLE "delivery_notes"
    ADD CONSTRAINT "delivery_notes_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "delivery_notes"
    ADD CONSTRAINT "delivery_notes_sale_order_id_fkey"
    FOREIGN KEY ("sale_order_id") REFERENCES "sale_orders"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
