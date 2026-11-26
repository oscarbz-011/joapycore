-- Precios escalonados y descuentos de proveedores pasan de JSON a filas con Decimal.

-- CreateTable
CREATE TABLE "supplier_catalog_price_tiers" (
    "tenant_id" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "catalog_item_id" TEXT NOT NULL,
    "min_quantity" INTEGER NOT NULL,
    "price" DECIMAL(23,8) NOT NULL,

CONSTRAINT "supplier_catalog_price_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_volume_discounts" (
    "tenant_id" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "min_amount" DECIMAL(23,8) NOT NULL,
    "percent" DECIMAL(11,8) NOT NULL,

CONSTRAINT "supplier_volume_discounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_quantity_discounts" (
    "tenant_id" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "min_quantity" INTEGER NOT NULL,
    "percent" DECIMAL(11,8) NOT NULL,

CONSTRAINT "supplier_quantity_discounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "supplier_catalog_price_tiers_tenant_id_idx" ON "supplier_catalog_price_tiers"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_catalog_price_tiers_catalog_item_id_min_quantity_key" ON "supplier_catalog_price_tiers"("catalog_item_id", "min_quantity");

-- CreateIndex
CREATE INDEX "supplier_volume_discounts_tenant_id_idx" ON "supplier_volume_discounts"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_volume_discounts_supplier_id_min_amount_key" ON "supplier_volume_discounts"("supplier_id", "min_amount");

-- CreateIndex
CREATE INDEX "supplier_quantity_discounts_tenant_id_idx" ON "supplier_quantity_discounts"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_quantity_discounts_supplier_id_min_quantity_key" ON "supplier_quantity_discounts"("supplier_id", "min_quantity");

-- AddForeignKey
ALTER TABLE "supplier_catalog_price_tiers" ADD CONSTRAINT "supplier_catalog_price_tiers_catalog_item_id_fkey" FOREIGN KEY ("catalog_item_id") REFERENCES "supplier_catalog_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_volume_discounts" ADD CONSTRAINT "supplier_volume_discounts_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_quantity_discounts" ADD CONSTRAINT "supplier_quantity_discounts_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Copia los tramos que estaban en JSON. Sin ON CONFLICT: la API ya rechazaba
-- tramos repetidos, así que un duplicado tiene que frenar la migración.
INSERT INTO "supplier_catalog_price_tiers" ("tenant_id", "id", "catalog_item_id", "min_quantity", "price")
SELECT i."tenant_id", gen_random_uuid()::text, i."id", (t->>'minQuantity')::integer, (t->>'price')::numeric
FROM "supplier_catalog_items" i, jsonb_array_elements(i."price_tiers") t;

INSERT INTO "supplier_volume_discounts" ("tenant_id", "id", "supplier_id", "min_amount", "percent")
SELECT s."tenant_id", gen_random_uuid()::text, s."id", (d->>'minAmount')::numeric, (d->>'percent')::numeric
FROM "suppliers" s, jsonb_array_elements(s."volume_discounts") d;

INSERT INTO "supplier_quantity_discounts" ("tenant_id", "id", "supplier_id", "min_quantity", "percent")
SELECT s."tenant_id", gen_random_uuid()::text, s."id", (d->>'minQuantity')::integer, (d->>'percent')::numeric
FROM "suppliers" s, jsonb_array_elements(s."quantity_discounts") d;

-- AlterTable
ALTER TABLE "supplier_catalog_items" DROP COLUMN "price_tiers";

-- AlterTable
ALTER TABLE "suppliers" DROP COLUMN "quantity_discounts",
DROP COLUMN "volume_discounts";
