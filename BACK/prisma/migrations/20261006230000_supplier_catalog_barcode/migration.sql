-- Código de barras o del fabricante de un ítem de catálogo (opcional).
ALTER TABLE "supplier_catalog_items" ADD COLUMN "barcode" TEXT;

CREATE INDEX "supplier_catalog_items_tenant_id_barcode_idx"
ON "supplier_catalog_items"("tenant_id", "barcode");
