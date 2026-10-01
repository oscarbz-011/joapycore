ALTER TYPE "ProductUnitStatus" ADD VALUE 'ADJUSTED_OUT';

ALTER TABLE "product_units" ADD COLUMN "warehouse_id" TEXT;

ALTER TABLE "product_units"
ADD CONSTRAINT "product_units_warehouse_id_fkey"
FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "product_units_warehouse_id_idx" ON "product_units"("warehouse_id");
