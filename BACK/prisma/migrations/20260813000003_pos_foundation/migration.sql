-- ─── POS Foundation Migration ────────────────────────────────────────────────
-- Bundles early-stage restructuring changes needed before POS development:
--   1. OrderChannel enum + SaleOrder.channel / subtotal / total / posSessionId
--   2. SaleOrderItem.productId nullable + description field
--   3. Product.categoryId / brandId nullable
--   4. SalePayment.posSessionId
--   5. PosTerminal + PosSession tables
-- ─────────────────────────────────────────────────────────────────────────────

-- CreateEnum
CREATE TYPE "OrderChannel" AS ENUM ('NORMAL', 'POS', 'ECOMMERCE');

-- CreateEnum
CREATE TYPE "PosSessionStatus" AS ENUM ('OPEN', 'CLOSED', 'DISCREPANCY');

-- AlterTable: Product — make category and brand optional
ALTER TABLE "products"
  ALTER COLUMN "category_id" DROP NOT NULL,
  ALTER COLUMN "brand_id" DROP NOT NULL;

-- AlterTable: SaleOrderItem — productId nullable + free-text description
ALTER TABLE "sale_order_items"
  ALTER COLUMN "product_id" DROP NOT NULL,
  ADD COLUMN "description" TEXT;

-- AlterTable: SaleOrder — channel, denormalized totals, POS session link
ALTER TABLE "sale_orders"
  ADD COLUMN "channel"        "OrderChannel" NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN "subtotal"       DECIMAL(12, 2),
  ADD COLUMN "total"          DECIMAL(12, 2),
  ADD COLUMN "pos_session_id" TEXT;

-- AlterTable: SalePayment — link to POS session
ALTER TABLE "sale_payments"
  ADD COLUMN "pos_session_id" TEXT;

-- CreateTable: PosTerminal
CREATE TABLE "pos_terminals" (
    "id"         TEXT NOT NULL,
    "tenant_id"  TEXT NOT NULL,
    "branch_id"  TEXT NOT NULL,
    "name"       TEXT NOT NULL,
    "is_active"  BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_terminals_pkey" PRIMARY KEY ("id")
);

-- CreateTable: PosSession
CREATE TABLE "pos_sessions" (
    "id"            TEXT NOT NULL,
    "tenant_id"     TEXT NOT NULL,
    "terminal_id"   TEXT NOT NULL,
    "cashier_id"    TEXT NOT NULL,
    "status"        "PosSessionStatus" NOT NULL DEFAULT 'OPEN',
    "opening_cash"  DECIMAL(12, 2) NOT NULL,
    "closing_cash"  DECIMAL(12, 2),
    "expected_cash" DECIMAL(12, 2),
    "difference"    DECIMAL(12, 2),
    "opened_at"     TIMESTAMP(3) NOT NULL,
    "closed_at"     TIMESTAMP(3),
    "notes"         TEXT,
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pos_terminals_tenant_id_branch_id_name_key"
  ON "pos_terminals"("tenant_id", "branch_id", "name");

CREATE INDEX "pos_sessions_tenant_id_status_idx"
  ON "pos_sessions"("tenant_id", "status");

CREATE INDEX "pos_sessions_tenant_id_terminal_id_idx"
  ON "pos_sessions"("tenant_id", "terminal_id");

-- AddForeignKey: PosTerminal
ALTER TABLE "pos_terminals"
  ADD CONSTRAINT "pos_terminals_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pos_terminals"
  ADD CONSTRAINT "pos_terminals_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: PosSession
ALTER TABLE "pos_sessions"
  ADD CONSTRAINT "pos_sessions_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pos_sessions"
  ADD CONSTRAINT "pos_sessions_terminal_id_fkey"
  FOREIGN KEY ("terminal_id") REFERENCES "pos_terminals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pos_sessions"
  ADD CONSTRAINT "pos_sessions_cashier_id_fkey"
  FOREIGN KEY ("cashier_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: SaleOrder → PosSession
ALTER TABLE "sale_orders"
  ADD CONSTRAINT "sale_orders_pos_session_id_fkey"
  FOREIGN KEY ("pos_session_id") REFERENCES "pos_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: SalePayment → PosSession
ALTER TABLE "sale_payments"
  ADD CONSTRAINT "sale_payments_pos_session_id_fkey"
  FOREIGN KEY ("pos_session_id") REFERENCES "pos_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
