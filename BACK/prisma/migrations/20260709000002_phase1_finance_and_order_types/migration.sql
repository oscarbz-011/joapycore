-- Phase 1: Finance module + Order types
-- Adds QUOTED/DELIVERED states, orderType field, and Loan/Installment tables.
--
-- Note: ALTER TYPE ... ADD VALUE runs outside a transaction block in PostgreSQL.
-- Using IF NOT EXISTS for idempotency.

-- ── Step 1: New enum values on SaleOrderStatus ────────────────────────────────
ALTER TYPE "SaleOrderStatus" ADD VALUE IF NOT EXISTS 'QUOTED';
ALTER TYPE "SaleOrderStatus" ADD VALUE IF NOT EXISTS 'DELIVERED';

-- ── Step 2: New enum types ────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "OrderType" AS ENUM ('STANDARD', 'QUOTE', 'WHOLESALE');
EXCEPTION WHEN duplicate_object THEN null;
END; $$;

DO $$ BEGIN
  CREATE TYPE "LoanStatus" AS ENUM ('ACTIVE', 'PAID', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN null;
END; $$;

DO $$ BEGIN
  CREATE TYPE "InstallmentStatus" AS ENUM ('PENDING', 'PARTIAL', 'PAID', 'OVERDUE');
EXCEPTION WHEN duplicate_object THEN null;
END; $$;

-- ── Step 3: Add order_type column to sale_orders ──────────────────────────────
ALTER TABLE "sale_orders"
  ADD COLUMN IF NOT EXISTS "order_type" "OrderType" NOT NULL DEFAULT 'STANDARD';

-- ── Step 4: Create loans table ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "loans" (
  "id"                  TEXT            NOT NULL,
  "tenant_id"           TEXT            NOT NULL,
  "sale_order_id"       TEXT            NOT NULL,
  "customer_id"         TEXT            NOT NULL,
  "principal"           DECIMAL(12,2)   NOT NULL,
  "interest_rate"       DECIMAL(5,2)    NOT NULL,
  "total_amount"        DECIMAL(12,2)   NOT NULL,
  "total_installments"  INTEGER         NOT NULL,
  "status"              "LoanStatus"    NOT NULL DEFAULT 'ACTIVE',
  "contract_url"        TEXT,
  "created_at"          TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMPTZ     NOT NULL,
  CONSTRAINT "loans_pkey" PRIMARY KEY ("id")
);

-- ── Step 5: Create installments table ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "installments" (
  "id"           TEXT                NOT NULL,
  "tenant_id"    TEXT                NOT NULL,
  "loan_id"      TEXT                NOT NULL,
  "number"       INTEGER             NOT NULL,
  "due_date"     TIMESTAMPTZ         NOT NULL,
  "amount"       DECIMAL(12,2)       NOT NULL,
  "paid_amount"  DECIMAL(12,2)       NOT NULL DEFAULT 0,
  "paid_at"      TIMESTAMPTZ,
  "status"       "InstallmentStatus" NOT NULL DEFAULT 'PENDING',
  "notes"        TEXT,
  "created_at"   TIMESTAMPTZ         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"   TIMESTAMPTZ         NOT NULL,
  CONSTRAINT "installments_pkey" PRIMARY KEY ("id")
);

-- ── Step 6: Indexes ───────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS "loans_sale_order_id_key"
  ON "loans"("sale_order_id");

CREATE UNIQUE INDEX IF NOT EXISTS "installments_loan_id_number_key"
  ON "installments"("loan_id", "number");

CREATE INDEX IF NOT EXISTS "installments_tenant_id_due_date_idx"
  ON "installments"("tenant_id", "due_date");

-- ── Step 7: Foreign keys ──────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE "loans" ADD CONSTRAINT "loans_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END; $$;

DO $$ BEGIN
  ALTER TABLE "loans" ADD CONSTRAINT "loans_sale_order_id_fkey"
    FOREIGN KEY ("sale_order_id") REFERENCES "sale_orders"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END; $$;

DO $$ BEGIN
  ALTER TABLE "loans" ADD CONSTRAINT "loans_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "customers"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END; $$;

DO $$ BEGIN
  ALTER TABLE "installments" ADD CONSTRAINT "installments_loan_id_fkey"
    FOREIGN KEY ("loan_id") REFERENCES "loans"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END; $$;

DO $$ BEGIN
  ALTER TABLE "installments" ADD CONSTRAINT "installments_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END; $$;
