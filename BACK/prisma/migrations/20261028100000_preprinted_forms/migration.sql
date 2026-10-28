-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "form_print_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "form_printed_at" TIMESTAMP(3),
ADD COLUMN     "physical_scan_file_id" TEXT;

-- AlterTable
ALTER TABLE "billing_series" ADD COLUMN     "print_layout" JSONB;

-- CreateTable
CREATE TABLE "billing_voided_numbers" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "series_id" TEXT NOT NULL,
    "serie_code" TEXT NOT NULL DEFAULT '',
    "sequential" INTEGER NOT NULL,
    "invoice_id" TEXT,
    "reason" TEXT NOT NULL,
    "scan_file_id" TEXT,
    "voided_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_voided_numbers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "billing_voided_numbers_scan_file_id_key" ON "billing_voided_numbers"("scan_file_id");

-- CreateIndex
CREATE INDEX "billing_voided_numbers_tenant_id_series_id_idx" ON "billing_voided_numbers"("tenant_id", "series_id");

-- CreateIndex
CREATE UNIQUE INDEX "billing_voided_numbers_series_id_serie_code_sequential_key" ON "billing_voided_numbers"("series_id", "serie_code", "sequential");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_physical_scan_file_id_key" ON "invoices"("physical_scan_file_id");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_physical_scan_file_id_fkey" FOREIGN KEY ("physical_scan_file_id") REFERENCES "file_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_voided_numbers" ADD CONSTRAINT "billing_voided_numbers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_voided_numbers" ADD CONSTRAINT "billing_voided_numbers_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "billing_series"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_voided_numbers" ADD CONSTRAINT "billing_voided_numbers_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_voided_numbers" ADD CONSTRAINT "billing_voided_numbers_scan_file_id_fkey" FOREIGN KEY ("scan_file_id") REFERENCES "file_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
