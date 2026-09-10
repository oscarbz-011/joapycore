-- CreateTable: catálogo del proveedor previo al mapeo al catálogo interno.
-- product_id es NULLABLE a propósito: el ítem existe suelto hasta vincularlo.
CREATE TABLE "supplier_catalog_items" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "supplier_sku" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "price" DECIMAL(12,2),
    "supplier_unit" TEXT,
    "conversion_factor" DECIMAL(12,4),
    "valid_from" TIMESTAMP(3),
    "valid_to" TIMESTAMP(3),
    "product_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_catalog_items_pkey" PRIMARY KEY ("id")
);

-- Clave natural de la importación: un mismo código no se duplica por proveedor.
CREATE UNIQUE INDEX "supplier_catalog_items_supplier_id_supplier_sku_key"
    ON "supplier_catalog_items"("supplier_id", "supplier_sku");
CREATE INDEX "supplier_catalog_items_tenant_id_supplier_id_idx"
    ON "supplier_catalog_items"("tenant_id", "supplier_id");

ALTER TABLE "supplier_catalog_items" ADD CONSTRAINT "supplier_catalog_items_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_catalog_items" ADD CONSTRAINT "supplier_catalog_items_supplier_id_fkey"
    FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_catalog_items" ADD CONSTRAINT "supplier_catalog_items_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
