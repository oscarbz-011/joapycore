-- CreateEnum
CREATE TYPE "Industry" AS ENUM ('electrodomesticos');

-- CreateEnum
CREATE TYPE "ProductUnitStatus" AS ENUM ('IN_STOCK', 'SOLD', 'RETURNED', 'DAMAGED');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('IN', 'OUT', 'ADJUSTMENT', 'TRANSFER');

-- CreateEnum
CREATE TYPE "PurchaseType" AS ENUM ('LOCAL', 'IMPORT');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SaleOrderStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'INVOICED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PAID', 'CANCELLED');

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "industry" "Industry" NOT NULL DEFAULT 'electrodomesticos';

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brands" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "brand_id" TEXT NOT NULL,
    "model" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_serialized" BOOLEAN NOT NULL DEFAULT false,
    "unit" TEXT NOT NULL DEFAULT 'unidad',
    "cost_price" DECIMAL(12,2) NOT NULL,
    "sale_price" DECIMAL(12,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_units" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "serial_number" TEXT NOT NULL,
    "status" "ProductUnitStatus" NOT NULL DEFAULT 'IN_STOCK',
    "purchase_order_item_id" TEXT,
    "sale_order_item_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reference_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact_name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "tax_id" TEXT,
    "is_importer" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "purchase_type" "PurchaseType" NOT NULL DEFAULT 'LOCAL',
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "order_date" TIMESTAMP(3) NOT NULL,
    "expected_date" TIMESTAMP(3),
    "exchange_rate" DECIMAL(10,4),
    "customs_duty" DECIMAL(5,2),
    "customs_ref" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_items" (
    "id" TEXT NOT NULL,
    "purchase_order_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "received_qty" INTEGER NOT NULL DEFAULT 0,
    "unit_cost" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "tax_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_orders" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "status" "SaleOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "order_date" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sale_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_order_items" (
    "id" TEXT NOT NULL,
    "sale_order_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "sale_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "sale_order_id" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "issued_at" TIMESTAMP(3),
    "due_date" TIMESTAMP(3),
    "total" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_items" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categories_tenant_id_name_key" ON "categories"("tenant_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "brands_tenant_id_name_key" ON "brands"("tenant_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "product_units_tenant_id_product_id_serial_number_key" ON "product_units"("tenant_id", "product_id", "serial_number");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_sale_order_id_key" ON "invoices"("sale_order_id");

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brands" ADD CONSTRAINT "brands_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_units" ADD CONSTRAINT "product_units_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_units" ADD CONSTRAINT "product_units_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_units" ADD CONSTRAINT "product_units_purchase_order_item_id_fkey" FOREIGN KEY ("purchase_order_item_id") REFERENCES "purchase_order_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_units" ADD CONSTRAINT "product_units_sale_order_item_id_fkey" FOREIGN KEY ("sale_order_item_id") REFERENCES "sale_order_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_orders" ADD CONSTRAINT "sale_orders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_orders" ADD CONSTRAINT "sale_orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_order_items" ADD CONSTRAINT "sale_order_items_sale_order_id_fkey" FOREIGN KEY ("sale_order_id") REFERENCES "sale_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_order_items" ADD CONSTRAINT "sale_order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_sale_order_id_fkey" FOREIGN KEY ("sale_order_id") REFERENCES "sale_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
