-- Factura y Recibo como plantillas PDF reales (Puppeteer, mismo mecanismo
-- que los contratos): numeración automática de factura, PDF generado y
-- almacenado, y mora con días de tolerancia configurables.

ALTER TYPE "TemplateKind" ADD VALUE 'INVOICE';
ALTER TYPE "TemplateKind" ADD VALUE 'PAYMENT_RECEIPT';

ALTER TABLE "credit_configs" ADD COLUMN "mora_grace_days" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "invoices" ADD COLUMN "establecimiento" TEXT;
ALTER TABLE "invoices" ADD COLUMN "punto_expedicion" TEXT;
ALTER TABLE "invoices" ADD COLUMN "sequential" INTEGER;
ALTER TABLE "invoices" ADD COLUMN "pdf_file_id" TEXT;

ALTER TABLE "payment_receipts" ADD COLUMN "pdf_file_id" TEXT;

CREATE UNIQUE INDEX "invoices_tenant_id_establecimiento_punto_expedicion_sequen_key"
    ON "invoices"("tenant_id", "establecimiento", "punto_expedicion", "sequential");

CREATE UNIQUE INDEX "invoices_pdf_file_id_key" ON "invoices"("pdf_file_id");
CREATE UNIQUE INDEX "payment_receipts_pdf_file_id_key" ON "payment_receipts"("pdf_file_id");

ALTER TABLE "invoices" ADD CONSTRAINT "invoices_pdf_file_id_fkey" FOREIGN KEY ("pdf_file_id") REFERENCES "file_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payment_receipts" ADD CONSTRAINT "payment_receipts_pdf_file_id_fkey" FOREIGN KEY ("pdf_file_id") REFERENCES "file_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
