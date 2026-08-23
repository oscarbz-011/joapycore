-- AlterEnum
ALTER TYPE "TemplateKind" ADD VALUE 'QUOTE';

-- AlterTable
ALTER TABLE "sale_orders" ADD COLUMN "quote_number" TEXT,
ADD COLUMN "quote_pdf_file_id" TEXT;

-- AlterTable
ALTER TABLE "sale_order_items" ADD COLUMN "spec_notes" TEXT;

-- CreateIndex (único por tenant, no global — dos tenants pueden tener PRES-26-000001)
CREATE UNIQUE INDEX "sale_orders_tenant_id_quote_number_key" ON "sale_orders"("tenant_id", "quote_number");
