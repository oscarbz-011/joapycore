-- Condiciones comerciales del proveedor y de cada ítem de su catálogo.
CREATE TYPE "SupplierAvailability" AS ENUM ('AVAILABLE', 'ON_ORDER', 'OUT_OF_STOCK');

ALTER TABLE "suppliers"
ADD COLUMN "shipping_cost" DECIMAL(12,2),
ADD COLUMN "lead_time_days" INTEGER,
ADD COLUMN "min_order_amount" DECIMAL(12,2),
ADD COLUMN "volume_discounts" JSONB NOT NULL DEFAULT '[]';

ALTER TABLE "supplier_catalog_items"
ADD COLUMN "min_order_quantity" INTEGER,
ADD COLUMN "availability" "SupplierAvailability",
ADD COLUMN "availability_updated_at" TIMESTAMP(3),
ADD COLUMN "price_tiers" JSONB NOT NULL DEFAULT '[]';
