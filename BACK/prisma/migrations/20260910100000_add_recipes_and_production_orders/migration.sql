-- CreateEnum
CREATE TYPE "ProductionOrderStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateTable: receta / lista de materiales de un producto fabricado
CREATE TABLE "product_components" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "component_id" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_components_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_components_product_id_component_id_key"
    ON "product_components"("product_id", "component_id");
CREATE INDEX "product_components_tenant_id_product_id_idx"
    ON "product_components"("tenant_id", "product_id");

ALTER TABLE "product_components" ADD CONSTRAINT "product_components_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_components" ADD CONSTRAINT "product_components_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_components" ADD CONSTRAINT "product_components_component_id_fkey"
    FOREIGN KEY ("component_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: orden de producción
CREATE TABLE "production_orders" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "order_number" INTEGER NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "status" "ProductionOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "warehouse_id" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "production_orders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "production_orders_tenant_id_order_number_key"
    ON "production_orders"("tenant_id", "order_number");
CREATE INDEX "production_orders_tenant_id_status_idx"
    ON "production_orders"("tenant_id", "status");

ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_warehouse_id_fkey"
    FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: consumo planificado vs. real por componente
CREATE TABLE "production_order_items" (
    "id" TEXT NOT NULL,
    "production_order_id" TEXT NOT NULL,
    "component_id" TEXT NOT NULL,
    "planned_quantity" DECIMAL(12,3) NOT NULL,
    "used_quantity" DECIMAL(12,3) NOT NULL DEFAULT 0,

    CONSTRAINT "production_order_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "production_order_items_production_order_id_component_id_key"
    ON "production_order_items"("production_order_id", "component_id");

ALTER TABLE "production_order_items" ADD CONSTRAINT "production_order_items_production_order_id_fkey"
    FOREIGN KEY ("production_order_id") REFERENCES "production_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "production_order_items" ADD CONSTRAINT "production_order_items_component_id_fkey"
    FOREIGN KEY ("component_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
