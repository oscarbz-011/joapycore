-- ══════════════════════════════════════════════════════════════════════════════
-- Migration: expand_all_modules_catalog
-- Covers all schema changes accumulated since 20260620020502_hr_module plus:
--   • Remove Industry enum → tenants.industry becomes TEXT nullable
--   • Add activated_at to tenant_modules
--   • Add all new enums, tables, columns introduced between migrations
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Enums ─────────────────────────────────────────────────────────────────────
-- Types already created in 20260618221309_expand_schema are handled via
-- RENAME VALUE / ADD VALUE so replaying migrations from scratch works cleanly.

-- StockMovementType: unchanged — skip if exists
DO $$ BEGIN CREATE TYPE "StockMovementType" AS ENUM ('IN', 'OUT', 'ADJUSTMENT', 'TRANSFER');
EXCEPTION WHEN duplicate_object THEN null; END; $$;

-- PurchaseType: unchanged — skip if exists
DO $$ BEGIN CREATE TYPE "PurchaseType" AS ENUM ('LOCAL', 'IMPORT');
EXCEPTION WHEN duplicate_object THEN null; END; $$;

-- PurchaseOrderStatus: DRAFT was renamed to PENDING
DO $$ BEGIN CREATE TYPE "PurchaseOrderStatus" AS ENUM ('PENDING', 'CONFIRMED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN
  ALTER TYPE "PurchaseOrderStatus" RENAME VALUE 'DRAFT' TO 'PENDING';
END; $$;

-- SaleOrderStatus: DRAFT renamed to PENDING + new values added
DO $$ BEGIN CREATE TYPE "SaleOrderStatus" AS ENUM ('PENDING', 'PENDING_CREDIT_APPROVAL', 'CREDIT_APPROVED', 'CREDIT_REJECTED', 'CONFIRMED', 'INVOICED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN
  ALTER TYPE "SaleOrderStatus" RENAME VALUE 'DRAFT' TO 'PENDING';
END; $$;
ALTER TYPE "SaleOrderStatus" ADD VALUE IF NOT EXISTS 'PENDING_CREDIT_APPROVAL';
ALTER TYPE "SaleOrderStatus" ADD VALUE IF NOT EXISTS 'CREDIT_APPROVED';
ALTER TYPE "SaleOrderStatus" ADD VALUE IF NOT EXISTS 'CREDIT_REJECTED';

-- InvoiceStatus: DRAFT renamed to PENDING
DO $$ BEGIN CREATE TYPE "InvoiceStatus" AS ENUM ('PENDING', 'ISSUED', 'PAID', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN
  ALTER TYPE "InvoiceStatus" RENAME VALUE 'DRAFT' TO 'PENDING';
END; $$;

-- ProductUnitStatus: unchanged — skip if exists
DO $$ BEGIN CREATE TYPE "ProductUnitStatus" AS ENUM ('IN_STOCK', 'SOLD', 'RETURNED', 'DAMAGED');
EXCEPTION WHEN duplicate_object THEN null; END; $$;

-- DocumentType: already created in 20260620020502_hr_module — skip if exists
DO $$ BEGIN CREATE TYPE "DocumentType" AS ENUM ('CI', 'RUC', 'PASSPORT');
EXCEPTION WHEN duplicate_object THEN null; END; $$;

-- New types (not present in any prior migration)
CREATE TYPE "AlertType"       AS ENUM ('STOCK_LOW', 'PAYMENT_DUE', 'INVOICE_OVERDUE');
CREATE TYPE "AlertChannel"    AS ENUM ('EMAIL', 'SYSTEM');
CREATE TYPE "SaleType"        AS ENUM ('CASH', 'CREDIT');
CREATE TYPE "MarkupMethod"    AS ENUM ('PERCENTAGE', 'FIXED');
CREATE TYPE "CreditNoteStatus" AS ENUM ('ISSUED', 'APPLIED');
CREATE TYPE "ARStatus"        AS ENUM ('PENDING', 'PARTIAL', 'PAID', 'CANCELLED');
CREATE TYPE "EmployeeCount"   AS ENUM ('1-5', '6-20', '21-50', '51-200', '201+');

-- ── Drop Industry enum → tenants.industry becomes TEXT nullable ───────────────

ALTER TABLE "tenants"
  ALTER COLUMN "industry" DROP DEFAULT,
  ALTER COLUMN "industry" TYPE TEXT USING "industry"::TEXT,
  ALTER COLUMN "industry" DROP NOT NULL;

DROP TYPE IF EXISTS "Industry";

-- ── tenant_modules: add activated_at ─────────────────────────────────────────

ALTER TABLE "tenant_modules"
  ALTER COLUMN "active" SET DEFAULT false,
  ADD COLUMN "activated_at" TIMESTAMP(3);

-- ── tenants: expand company profile ─────────────────────────────────────────

ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "razon_social"   TEXT,
  ADD COLUMN IF NOT EXISTS "ruc"            TEXT,
  ADD COLUMN IF NOT EXISTS "address"        TEXT,
  ADD COLUMN IF NOT EXISTS "postal_code"    TEXT,
  ADD COLUMN IF NOT EXISTS "city"           TEXT,
  ADD COLUMN IF NOT EXISTS "department"     TEXT,
  ADD COLUMN IF NOT EXISTS "country"        TEXT NOT NULL DEFAULT 'Paraguay',
  ADD COLUMN IF NOT EXISTS "phone"          TEXT,
  ADD COLUMN IF NOT EXISTS "email"          TEXT,
  ADD COLUMN IF NOT EXISTS "logo_url"       TEXT,
  ADD COLUMN IF NOT EXISTS "employee_count" "EmployeeCount",
  ADD COLUMN IF NOT EXISTS "currency"       TEXT NOT NULL DEFAULT 'PYG';

-- ── users: add username ───────────────────────────────────────────────────────

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "username" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "users_username_key" ON "users"("username");

-- ── branches ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "branches" (
    "id"         TEXT NOT NULL,
    "tenant_id"  TEXT NOT NULL,
    "name"       TEXT NOT NULL,
    "address"    TEXT,
    "phone"      TEXT,
    "is_main"    BOOLEAN NOT NULL DEFAULT false,
    "is_active"  BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "branches_tenant_id_name_key" ON "branches"("tenant_id", "name");
ALTER TABLE "branches" ADD CONSTRAINT "branches_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── categories & brands ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "categories" (
    "id"        TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "categories_tenant_id_name_key" ON "categories"("tenant_id", "name");
ALTER TABLE "categories" ADD CONSTRAINT "categories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "brands" (
    "id"        TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "brands_tenant_id_name_key" ON "brands"("tenant_id", "name");
ALTER TABLE "brands" ADD CONSTRAINT "brands_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── products ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "products" (
    "id"           TEXT NOT NULL,
    "tenant_id"    TEXT NOT NULL,
    "category_id"  TEXT NOT NULL,
    "brand_id"     TEXT NOT NULL,
    "model"        TEXT,
    "name"         TEXT NOT NULL,
    "description"  TEXT,
    "is_serialized" BOOLEAN NOT NULL DEFAULT false,
    "uses_lots"    BOOLEAN NOT NULL DEFAULT false,
    "unit"         TEXT NOT NULL DEFAULT 'unidad',
    "weight_kg"    DOUBLE PRECISION,
    "height_cm"    DOUBLE PRECISION,
    "width_cm"     DOUBLE PRECISION,
    "depth_cm"     DOUBLE PRECISION,
    "cost_price"   DECIMAL(12,2) NOT NULL,
    "sale_price"   DECIMAL(12,2) NOT NULL,
    "stock_min"    INTEGER NOT NULL DEFAULT 0,
    "stock_initial" INTEGER NOT NULL DEFAULT 0,
    "iva_tax_rate" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "iva_included" BOOLEAN NOT NULL DEFAULT false,
    "is_active"    BOOLEAN NOT NULL DEFAULT true,
    "deleted_at"   TIMESTAMP(3),
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "products" ADD CONSTRAINT "products_tenant_id_fkey"   FOREIGN KEY ("tenant_id")   REFERENCES "tenants"("id")     ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_fkey"    FOREIGN KEY ("brand_id")    REFERENCES "brands"("id")     ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── product_suppliers ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "product_suppliers" (
    "id"           TEXT NOT NULL,
    "tenant_id"    TEXT NOT NULL,
    "product_id"   TEXT NOT NULL,
    "supplier_id"  TEXT NOT NULL,
    "cost_price"   DECIMAL(12,2),
    "is_preferred" BOOLEAN NOT NULL DEFAULT false,
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "product_suppliers_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "product_suppliers_product_id_supplier_id_key" ON "product_suppliers"("product_id", "supplier_id");

-- ── product_units ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "product_units" (
    "id"                    TEXT NOT NULL,
    "tenant_id"             TEXT NOT NULL,
    "product_id"            TEXT NOT NULL,
    "serial_number"         TEXT NOT NULL,
    "status"                "ProductUnitStatus" NOT NULL DEFAULT 'IN_STOCK',
    "purchase_order_item_id" TEXT,
    "sale_order_item_id"    TEXT,
    "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"            TIMESTAMP(3) NOT NULL,
    CONSTRAINT "product_units_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "product_units_tenant_id_product_id_serial_number_key" ON "product_units"("tenant_id", "product_id", "serial_number");
ALTER TABLE "product_units" ADD CONSTRAINT "product_units_tenant_id_fkey"  FOREIGN KEY ("tenant_id")  REFERENCES "tenants"("id")   ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_units" ADD CONSTRAINT "product_units_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── product_batches ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "product_batches" (
    "id"                    TEXT NOT NULL,
    "tenant_id"             TEXT NOT NULL,
    "product_id"            TEXT NOT NULL,
    "batch_number"          TEXT NOT NULL,
    "entry_date"            TIMESTAMP(3) NOT NULL,
    "unit_cost"             DECIMAL(12,2) NOT NULL,
    "quantity"              INTEGER NOT NULL,
    "remaining_qty"         INTEGER NOT NULL,
    "purchase_order_item_id" TEXT,
    "expires_at"            TIMESTAMP(3),
    "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"            TIMESTAMP(3) NOT NULL,
    CONSTRAINT "product_batches_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "product_batches_tenant_id_product_id_batch_number_key" ON "product_batches"("tenant_id", "product_id", "batch_number");
CREATE INDEX IF NOT EXISTS "product_batches_tenant_id_product_id_remaining_qty_idx" ON "product_batches"("tenant_id", "product_id", "remaining_qty");
ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_tenant_id_fkey"  FOREIGN KEY ("tenant_id")  REFERENCES "tenants"("id")   ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── stock_movements ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "stock_movements" (
    "id"           TEXT NOT NULL,
    "tenant_id"    TEXT NOT NULL,
    "product_id"   TEXT NOT NULL,
    "branch_id"    TEXT,
    "type"         "StockMovementType" NOT NULL,
    "quantity"     INTEGER NOT NULL,
    "reference_id" TEXT,
    "notes"        TEXT,
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_tenant_id_fkey"  FOREIGN KEY ("tenant_id")  REFERENCES "tenants"("id")   ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_branch_id_fkey"  FOREIGN KEY ("branch_id")  REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── suppliers ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "suppliers" (
    "id"           TEXT NOT NULL,
    "tenant_id"    TEXT NOT NULL,
    "name"         TEXT NOT NULL,
    "contact_name" TEXT,
    "email"        TEXT,
    "phone"        TEXT,
    "address"      TEXT,
    "tax_id"       TEXT,
    "is_importer"  BOOLEAN NOT NULL DEFAULT false,
    "is_active"    BOOLEAN NOT NULL DEFAULT true,
    "deleted_at"   TIMESTAMP(3),
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "product_suppliers" ADD CONSTRAINT "product_suppliers_tenant_id_fkey"   FOREIGN KEY ("tenant_id")   REFERENCES "tenants"("id")    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_suppliers" ADD CONSTRAINT "product_suppliers_product_id_fkey"  FOREIGN KEY ("product_id")  REFERENCES "products"("id")   ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_suppliers" ADD CONSTRAINT "product_suppliers_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── purchase_orders ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "purchase_orders" (
    "id"            TEXT NOT NULL,
    "tenant_id"     TEXT NOT NULL,
    "supplier_id"   TEXT NOT NULL,
    "branch_id"     TEXT,
    "purchase_type" "PurchaseType" NOT NULL DEFAULT 'LOCAL',
    "status"        "PurchaseOrderStatus" NOT NULL DEFAULT 'PENDING',
    "order_date"    TIMESTAMP(3) NOT NULL,
    "expected_date" TIMESTAMP(3),
    "exchange_rate" DECIMAL(10,4),
    "customs_duty"  DECIMAL(5,2),
    "customs_ref"   TEXT,
    "notes"         TEXT,
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMP(3) NOT NULL,
    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_tenant_id_fkey"   FOREIGN KEY ("tenant_id")   REFERENCES "tenants"("id")    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_branch_id_fkey"   FOREIGN KEY ("branch_id")   REFERENCES "branches"("id")  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "purchase_order_items" (
    "id"               TEXT NOT NULL,
    "purchase_order_id" TEXT NOT NULL,
    "product_id"       TEXT NOT NULL,
    "quantity"         INTEGER NOT NULL,
    "received_qty"     INTEGER NOT NULL DEFAULT 0,
    "unit_cost"        DECIMAL(12,2) NOT NULL,
    CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_product_id_fkey"        FOREIGN KEY ("product_id")        REFERENCES "products"("id")       ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "product_units"  ADD CONSTRAINT "product_units_purchase_order_item_id_fkey"  FOREIGN KEY ("purchase_order_item_id") REFERENCES "purchase_order_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_purchase_order_item_id_fkey" FOREIGN KEY ("purchase_order_item_id") REFERENCES "purchase_order_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── customers ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "customers" (
    "id"                 TEXT NOT NULL,
    "tenant_id"          TEXT NOT NULL,
    "customer_code"      TEXT,
    "first_name"         TEXT NOT NULL,
    "second_first_name"  TEXT,
    "last_name"          TEXT NOT NULL,
    "second_last_name"   TEXT,
    "document_type"      "DocumentType",
    "document_number"    TEXT,
    "email"              TEXT,
    "phone"              TEXT,
    "address"            TEXT,
    "city"               TEXT,
    "profession"         TEXT,
    "monthly_income"     DECIMAL(12,2),
    "notes"              TEXT,
    "home_street"        TEXT,
    "home_neighborhood"  TEXT,
    "home_reference"     TEXT,
    "apt_building"       TEXT,
    "apt_floor"          TEXT,
    "apt_number"         TEXT,
    "is_active"          BOOLEAN NOT NULL DEFAULT true,
    "deleted_at"         TIMESTAMP(3),
    "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"         TIMESTAMP(3) NOT NULL,
    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "customers_tenant_id_customer_code_key" ON "customers"("tenant_id", "customer_code") WHERE "customer_code" IS NOT NULL;
ALTER TABLE "customers" ADD CONSTRAINT "customers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── sale_orders ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "sale_orders" (
    "id"               TEXT NOT NULL,
    "tenant_id"        TEXT NOT NULL,
    "customer_id"      TEXT NOT NULL,
    "branch_id"        TEXT,
    "created_by_id"    TEXT,
    "seller_id"        TEXT,
    "status"           "SaleOrderStatus" NOT NULL DEFAULT 'PENDING',
    "sale_type"        "SaleType" NOT NULL DEFAULT 'CASH',
    "installments"     INTEGER,
    "interest_rate"    DECIMAL(5,2),
    "order_date"       TIMESTAMP(3) NOT NULL,
    "notes"            TEXT,
    "approved_by_id"   TEXT,
    "approved_at"      TIMESTAMP(3),
    "rejected_by_id"   TEXT,
    "rejected_at"      TIMESTAMP(3),
    "rejection_reason" TEXT,
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"       TIMESTAMP(3) NOT NULL,
    CONSTRAINT "sale_orders_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "sale_orders" ADD CONSTRAINT "sale_orders_tenant_id_fkey"      FOREIGN KEY ("tenant_id")      REFERENCES "tenants"("id")   ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_orders" ADD CONSTRAINT "sale_orders_customer_id_fkey"    FOREIGN KEY ("customer_id")    REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_orders" ADD CONSTRAINT "sale_orders_branch_id_fkey"      FOREIGN KEY ("branch_id")      REFERENCES "branches"("id")  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sale_orders" ADD CONSTRAINT "sale_orders_created_by_id_fkey"  FOREIGN KEY ("created_by_id")  REFERENCES "users"("id")     ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sale_orders" ADD CONSTRAINT "sale_orders_seller_id_fkey"      FOREIGN KEY ("seller_id")      REFERENCES "users"("id")     ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sale_orders" ADD CONSTRAINT "sale_orders_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id")     ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sale_orders" ADD CONSTRAINT "sale_orders_rejected_by_id_fkey" FOREIGN KEY ("rejected_by_id") REFERENCES "users"("id")     ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "sale_order_items" (
    "id"                    TEXT NOT NULL,
    "sale_order_id"         TEXT NOT NULL,
    "product_id"            TEXT NOT NULL,
    "batch_id"              TEXT,
    "quantity"              INTEGER NOT NULL,
    "unit_price"            DECIMAL(12,2) NOT NULL,
    "iva_rate"              DECIMAL(5,2),
    "iva_amount"            DECIMAL(12,2),
    "unit_price_without_iva" DECIMAL(12,2),
    CONSTRAINT "sale_order_items_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "sale_order_items" ADD CONSTRAINT "sale_order_items_sale_order_id_fkey" FOREIGN KEY ("sale_order_id") REFERENCES "sale_orders"("id")    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_order_items" ADD CONSTRAINT "sale_order_items_product_id_fkey"    FOREIGN KEY ("product_id")    REFERENCES "products"("id")        ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_order_items" ADD CONSTRAINT "sale_order_items_batch_id_fkey"      FOREIGN KEY ("batch_id")      REFERENCES "product_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "product_units" ADD CONSTRAINT "product_units_sale_order_item_id_fkey" FOREIGN KEY ("sale_order_item_id") REFERENCES "sale_order_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── invoices ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "invoices" (
    "id"             TEXT NOT NULL,
    "tenant_id"      TEXT NOT NULL,
    "sale_order_id"  TEXT NOT NULL,
    "status"         "InvoiceStatus" NOT NULL DEFAULT 'PENDING',
    "issued_at"      TIMESTAMP(3),
    "due_date"       TIMESTAMP(3),
    "total"          DECIMAL(12,2) NOT NULL,
    "notes"          TEXT,
    "invoice_number" TEXT,
    "invoice_prefix" TEXT,
    "pdf_url"        TEXT,
    "cdc"            TEXT,
    "xml_content"    TEXT,
    "qr_url"         TEXT,
    "electronic_at"  TIMESTAMP(3),
    "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"     TIMESTAMP(3) NOT NULL,
    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "invoices_sale_order_id_key" ON "invoices"("sale_order_id");
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_fkey"     FOREIGN KEY ("tenant_id")     REFERENCES "tenants"("id")     ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_sale_order_id_fkey" FOREIGN KEY ("sale_order_id") REFERENCES "sale_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "invoice_items" (
    "id"                    TEXT NOT NULL,
    "invoice_id"            TEXT NOT NULL,
    "description"           TEXT NOT NULL,
    "quantity"              INTEGER NOT NULL,
    "unit_price"            DECIMAL(12,2) NOT NULL,
    "total"                 DECIMAL(12,2) NOT NULL,
    "iva_rate"              DECIMAL(5,2),
    "iva_amount"            DECIMAL(12,2),
    "unit_price_without_iva" DECIMAL(12,2),
    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── credit_notes ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "credit_notes" (
    "id"         TEXT NOT NULL,
    "tenant_id"  TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "number"     TEXT,
    "reason"     TEXT NOT NULL,
    "total"      DECIMAL(12,2) NOT NULL,
    "status"     "CreditNoteStatus" NOT NULL DEFAULT 'ISSUED',
    "issued_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "credit_notes_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_tenant_id_fkey"  FOREIGN KEY ("tenant_id")  REFERENCES "tenants"("id")   ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── accounts_receivable ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "accounts_receivable" (
    "id"          TEXT NOT NULL,
    "tenant_id"   TEXT NOT NULL,
    "invoice_id"  TEXT NOT NULL,
    "amount"      DECIMAL(12,2) NOT NULL,
    "paid_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status"      "ARStatus" NOT NULL DEFAULT 'PENDING',
    "due_date"    TIMESTAMP(3),
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMP(3) NOT NULL,
    CONSTRAINT "accounts_receivable_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "accounts_receivable_invoice_id_key" ON "accounts_receivable"("invoice_id");
ALTER TABLE "accounts_receivable" ADD CONSTRAINT "accounts_receivable_tenant_id_fkey"  FOREIGN KEY ("tenant_id")  REFERENCES "tenants"("id")   ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "accounts_receivable" ADD CONSTRAINT "accounts_receivable_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── payment_records ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "payment_records" (
    "id"                     TEXT NOT NULL,
    "tenant_id"              TEXT NOT NULL,
    "accounts_receivable_id" TEXT NOT NULL,
    "amount"                 DECIMAL(12,2) NOT NULL,
    "payment_method"         "PaymentMethod" NOT NULL,
    "payment_date"           TIMESTAMP(3) NOT NULL,
    "reference"              TEXT,
    "notes"                  TEXT,
    "created_at"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payment_records_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_tenant_id_fkey"              FOREIGN KEY ("tenant_id")              REFERENCES "tenants"("id")              ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_accounts_receivable_id_fkey" FOREIGN KEY ("accounts_receivable_id") REFERENCES "accounts_receivable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── positions: add area_id + role_id ─────────────────────────────────────────

ALTER TABLE "positions"
  ADD COLUMN IF NOT EXISTS "area_id" TEXT,
  ADD COLUMN IF NOT EXISTS "role_id" TEXT;

ALTER TABLE "positions" ADD CONSTRAINT "positions_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "areas"("id")  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "positions" ADD CONSTRAINT "positions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── employees: add branch_id ──────────────────────────────────────────────────

ALTER TABLE "employees"
  ADD COLUMN IF NOT EXISTS "branch_id" TEXT;

ALTER TABLE "employees" ADD CONSTRAINT "employees_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── payroll_records: DRAFT → PENDING ─────────────────────────────────────────

ALTER TYPE "PayrollStatus" RENAME VALUE 'DRAFT' TO 'PENDING';

-- ── audit_logs ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "audit_logs" (
    "id"          TEXT NOT NULL,
    "tenant_id"   TEXT NOT NULL,
    "user_id"     TEXT,
    "module"      TEXT NOT NULL,
    "action"      TEXT NOT NULL,
    "resource_id" TEXT,
    "before"      JSONB,
    "after"       JSONB,
    "ip_address"  TEXT,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "audit_logs_tenant_id_created_at_idx" ON "audit_logs"("tenant_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "audit_logs_tenant_id_module_idx"     ON "audit_logs"("tenant_id", "module");
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey"   FOREIGN KEY ("user_id")   REFERENCES "users"("id")   ON DELETE SET NULL ON UPDATE CASCADE;

-- ── alert_configs ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "alert_configs" (
    "id"         TEXT NOT NULL,
    "tenant_id"  TEXT NOT NULL,
    "type"       "AlertType" NOT NULL,
    "channel"    "AlertChannel" NOT NULL DEFAULT 'SYSTEM',
    "is_active"  BOOLEAN NOT NULL DEFAULT true,
    "threshold"  INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "alert_configs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "alert_configs_tenant_id_type_key" ON "alert_configs"("tenant_id", "type");
ALTER TABLE "alert_configs" ADD CONSTRAINT "alert_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── file_records ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "file_records" (
    "id"            TEXT NOT NULL,
    "tenant_id"     TEXT NOT NULL,
    "module"        TEXT NOT NULL,
    "entity_type"   TEXT NOT NULL,
    "entity_id"     TEXT,
    "bucket"        TEXT NOT NULL DEFAULT 'local',
    "key"           TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type"     TEXT NOT NULL,
    "size_bytes"    INTEGER NOT NULL,
    "uploaded_by"   TEXT,
    "url"           TEXT,
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "file_records_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "file_records" ADD CONSTRAINT "file_records_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── credit_configs + credit_plans ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "credit_configs" (
    "id"         TEXT NOT NULL,
    "tenant_id"  TEXT NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "credit_configs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "credit_configs_tenant_id_key" ON "credit_configs"("tenant_id");
ALTER TABLE "credit_configs" ADD CONSTRAINT "credit_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "credit_plans" (
    "id"               TEXT NOT NULL,
    "credit_config_id" TEXT NOT NULL,
    "installments"     INTEGER NOT NULL,
    "interest_rate"    DECIMAL(5,2) NOT NULL,
    "is_active"        BOOLEAN NOT NULL DEFAULT true,
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"       TIMESTAMP(3) NOT NULL,
    CONSTRAINT "credit_plans_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "credit_plans_credit_config_id_installments_key" ON "credit_plans"("credit_config_id", "installments");
ALTER TABLE "credit_plans" ADD CONSTRAINT "credit_plans_credit_config_id_fkey" FOREIGN KEY ("credit_config_id") REFERENCES "credit_configs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── pricing_configs ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "pricing_configs" (
    "id"             TEXT NOT NULL,
    "tenant_id"      TEXT NOT NULL,
    "markup_method"  "MarkupMethod" NOT NULL DEFAULT 'PERCENTAGE',
    "default_markup" DECIMAL(10,2) NOT NULL,
    "updated_at"     TIMESTAMP(3) NOT NULL,
    CONSTRAINT "pricing_configs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "pricing_configs_tenant_id_key" ON "pricing_configs"("tenant_id");
ALTER TABLE "pricing_configs" ADD CONSTRAINT "pricing_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── sale_targets ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "sale_targets" (
    "id"            TEXT NOT NULL,
    "tenant_id"     TEXT NOT NULL,
    "user_id"       TEXT,
    "period"        TEXT NOT NULL,
    "target_amount" DECIMAL(14,2) NOT NULL,
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMP(3) NOT NULL,
    CONSTRAINT "sale_targets_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "sale_targets" ADD CONSTRAINT "sale_targets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_targets" ADD CONSTRAINT "sale_targets_user_id_fkey"   FOREIGN KEY ("user_id")   REFERENCES "users"("id")   ON DELETE SET NULL ON UPDATE CASCADE;

-- ── user_permissions ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "user_permissions" (
    "user_id"       TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,
    CONSTRAINT "user_permissions_pkey" PRIMARY KEY ("user_id", "permission_id")
);
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_user_id_fkey"       FOREIGN KEY ("user_id")       REFERENCES "users"("id")       ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
