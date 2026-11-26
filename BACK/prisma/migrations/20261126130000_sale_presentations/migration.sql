-- AlterTable
ALTER TABLE "sales_config" ADD COLUMN "presentations_enabled" BOOLEAN;

-- AlterTable
ALTER TABLE "sale_order_items" ADD COLUMN "presentation_id" TEXT,
ADD COLUMN "presentation_name" TEXT,
ADD COLUMN "unit_code" INTEGER,
ADD COLUMN "unit_factor" DECIMAL(18,8) NOT NULL DEFAULT 1,
ADD COLUMN "cut_length" DECIMAL(12,3),
ADD COLUMN "cut_width" DECIMAL(12,3),
ADD COLUMN "cut_height" DECIMAL(12,3);

-- CreateTable
CREATE TABLE "product_presentations" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit_code" INTEGER NOT NULL DEFAULT 77,
    "factor" DECIMAL(18,8) NOT NULL,
    "length" DECIMAL(12,3),
    "width" DECIMAL(12,3),
    "height" DECIMAL(12,3),
    "sale_price" DECIMAL(23,8) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_presentations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_presentations_tenant_id_idx" ON "product_presentations"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_presentations_product_id_name_key" ON "product_presentations"("product_id", "name");

-- AddForeignKey
ALTER TABLE "product_presentations" ADD CONSTRAINT "product_presentations_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
