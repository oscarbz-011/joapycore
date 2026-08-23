-- CreateEnum
CREATE TYPE "ComboPriceMode" AS ENUM ('FIXED', 'SUM_WITH_DISCOUNT');

-- AlterTable
ALTER TABLE "sale_order_items" ADD COLUMN "combo_id" TEXT,
ADD COLUMN "combo_group_id" TEXT;

-- CreateTable
CREATE TABLE "sale_combos" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price_mode" "ComboPriceMode" NOT NULL DEFAULT 'FIXED',
    "fixed_price" DECIMAL(12,2),
    "discount_percentage" DECIMAL(5,2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "sale_combos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_combo_items" (
    "id" TEXT NOT NULL,
    "combo_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "sale_combo_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_config" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "combos_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sales_config_tenant_id_key" ON "sales_config"("tenant_id");

-- AddForeignKey
ALTER TABLE "sale_order_items" ADD CONSTRAINT "sale_order_items_combo_id_fkey" FOREIGN KEY ("combo_id") REFERENCES "sale_combos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_combos" ADD CONSTRAINT "sale_combos_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_combo_items" ADD CONSTRAINT "sale_combo_items_combo_id_fkey" FOREIGN KEY ("combo_id") REFERENCES "sale_combos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_combo_items" ADD CONSTRAINT "sale_combo_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_config" ADD CONSTRAINT "sales_config_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
