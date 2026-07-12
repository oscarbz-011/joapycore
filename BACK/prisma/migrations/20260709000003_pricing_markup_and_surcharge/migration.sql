-- ══════════════════════════════════════════════════════════════════════════════
-- Migration: pricing_markup_and_surcharge
-- Adds:
--   • MarkupType enum (PERCENTAGE | FIXED)
--   • products.additional_markup / additional_markup_type  — per-product extra margin
--   • sale_orders.surcharge_type / surcharge_amount / surcharge_reason — delivery/zone fee
-- ══════════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE "MarkupType" AS ENUM ('PERCENTAGE', 'FIXED');
EXCEPTION WHEN duplicate_object THEN null; END; $$;

-- Per-product additional markup (on top of global config)
ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "additional_markup"      DECIMAL(8,2),
  ADD COLUMN IF NOT EXISTS "additional_markup_type" "MarkupType";

-- Per-order delivery / zone surcharge
ALTER TABLE "sale_orders"
  ADD COLUMN IF NOT EXISTS "surcharge_type"   "MarkupType",
  ADD COLUMN IF NOT EXISTS "surcharge_amount" DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "surcharge_reason" TEXT;
