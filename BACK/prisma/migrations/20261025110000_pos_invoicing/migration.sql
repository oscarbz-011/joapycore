-- CreateEnum
CREATE TYPE "PosPrintFormat" AS ENUM ('THERMAL_58', 'THERMAL_80', 'A4', 'HALF_LETTER');

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "anonymous_buyer" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "pos_terminals" ADD COLUMN     "invoice_series_id" TEXT,
ADD COLUMN     "print_format" "PosPrintFormat" NOT NULL DEFAULT 'A4',
ADD COLUMN     "thermal_paper_conservation" TEXT,
ADD COLUMN     "thermal_paper_report_file_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "pos_terminals_thermal_paper_report_file_id_key" ON "pos_terminals"("thermal_paper_report_file_id");

-- AddForeignKey
ALTER TABLE "pos_terminals" ADD CONSTRAINT "pos_terminals_invoice_series_id_fkey" FOREIGN KEY ("invoice_series_id") REFERENCES "billing_series"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_terminals" ADD CONSTRAINT "pos_terminals_thermal_paper_report_file_id_fkey" FOREIGN KEY ("thermal_paper_report_file_id") REFERENCES "file_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Una caja de una sucursal con una sola serie de facturas activa la toma;
-- si hay varias, la elige quien administra las cajas.
UPDATE "pos_terminals" t
SET "invoice_series_id" = s.id
FROM "billing_series" s
WHERE t.invoice_series_id IS NULL
  AND s.tenant_id = t.tenant_id
  AND s.branch_id = t.branch_id
  AND s.document_type = 'INVOICE'
  AND s.is_active = true
  AND (
    SELECT COUNT(*) FROM "billing_series" o
    WHERE o.tenant_id = t.tenant_id
      AND o.branch_id = t.branch_id
      AND o.document_type = 'INVOICE'
      AND o.is_active = true
  ) = 1;
