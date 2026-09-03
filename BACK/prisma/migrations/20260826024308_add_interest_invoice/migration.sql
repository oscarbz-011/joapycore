-- CreateEnum
CREATE TYPE "InvoiceType" AS ENUM ('SALE', 'INTEREST');

-- AlterEnum
ALTER TYPE "TemplateKind" ADD VALUE 'INTEREST_INVOICE';

-- DropForeignKey
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_sale_order_id_fkey";

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "invoice_type" "InvoiceType" NOT NULL DEFAULT 'SALE',
ADD COLUMN     "payment_receipt_id" TEXT,
ALTER COLUMN "sale_order_id" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "invoices_payment_receipt_id_key" ON "invoices"("payment_receipt_id");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_sale_order_id_fkey" FOREIGN KEY ("sale_order_id") REFERENCES "sale_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_payment_receipt_id_fkey" FOREIGN KEY ("payment_receipt_id") REFERENCES "payment_receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

