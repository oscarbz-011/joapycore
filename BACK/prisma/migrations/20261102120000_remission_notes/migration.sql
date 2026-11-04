-- CreateEnum
CREATE TYPE "RemissionMotive" AS ENUM ('SALE', 'CONSIGNMENT', 'EXPORT', 'PURCHASE', 'IMPORT', 'RETURN', 'BRANCH_TRANSFER', 'TRANSFORMATION', 'REPAIR', 'MOBILE_ISSUER', 'EXHIBITION', 'TRADE_FAIR', 'OTHER');

-- CreateEnum
CREATE TYPE "RemissionNoteStatus" AS ENUM ('ISSUED', 'VOIDED');

-- CreateEnum
CREATE TYPE "TransportType" AS ENUM ('OWN', 'THIRD_PARTY');

-- AlterEnum
ALTER TYPE "BillingDocumentType" ADD VALUE 'REMISSION_NOTE';

-- AlterEnum
ALTER TYPE "BillingEventType" ADD VALUE 'REMISSION_NOTE_ISSUED';

-- AlterTable
ALTER TABLE "billing_document_events" ADD COLUMN     "remission_note_id" TEXT;

-- CreateTable
CREATE TABLE "remission_notes" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "motive" "RemissionMotive" NOT NULL,
    "motive_detail" TEXT,
    "status" "RemissionNoteStatus" NOT NULL DEFAULT 'ISSUED',
    "invoice_id" TEXT,
    "from_warehouse_id" TEXT,
    "to_warehouse_id" TEXT,
    "customer_id" TEXT,
    "recipient_name" TEXT NOT NULL,
    "recipient_document" TEXT NOT NULL,
    "origin_address" TEXT NOT NULL,
    "origin_city" TEXT,
    "origin_department" TEXT,
    "destination_address" TEXT NOT NULL,
    "destination_city" TEXT,
    "destination_department" TEXT,
    "transport_type" "TransportType" NOT NULL,
    "vehicle_brand" TEXT NOT NULL,
    "vehicle_plate" TEXT NOT NULL,
    "trailer_plate" TEXT,
    "carrier_name" TEXT NOT NULL,
    "carrier_ruc" TEXT NOT NULL,
    "carrier_address" TEXT NOT NULL,
    "driver_name" TEXT NOT NULL,
    "driver_document" TEXT NOT NULL,
    "driver_address" TEXT NOT NULL,
    "transport_start_date" TIMESTAMP(3) NOT NULL,
    "transport_end_date" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "series_id" TEXT NOT NULL,
    "modality" "BillingModality" NOT NULL,
    "timbrado" TEXT NOT NULL,
    "timbrado_valid_from" TIMESTAMP(3),
    "timbrado_valid_until" TIMESTAMP(3),
    "serie_code" TEXT NOT NULL DEFAULT '',
    "establecimiento" TEXT NOT NULL,
    "punto_expedicion" TEXT NOT NULL,
    "sequential" INTEGER NOT NULL,
    "number_prefix" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issued_by_id" TEXT,
    "voided_at" TIMESTAMP(3),
    "void_reason" TEXT,
    "voided_by_id" TEXT,
    "pdf_file_id" TEXT,
    "physical_scan_file_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "remission_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "remission_note_items" (
    "id" TEXT NOT NULL,
    "remission_note_id" TEXT NOT NULL,
    "product_id" TEXT,
    "invoice_item_id" TEXT,
    "description" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "serial_numbers" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "remission_note_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "remission_notes_pdf_file_id_key" ON "remission_notes"("pdf_file_id");

-- CreateIndex
CREATE UNIQUE INDEX "remission_notes_physical_scan_file_id_key" ON "remission_notes"("physical_scan_file_id");

-- CreateIndex
CREATE INDEX "remission_notes_tenant_id_issued_at_idx" ON "remission_notes"("tenant_id", "issued_at");

-- CreateIndex
CREATE INDEX "remission_notes_invoice_id_idx" ON "remission_notes"("invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "remission_notes_series_id_serie_code_sequential_key" ON "remission_notes"("series_id", "serie_code", "sequential");

-- CreateIndex
CREATE INDEX "remission_note_items_remission_note_id_idx" ON "remission_note_items"("remission_note_id");

-- CreateIndex
CREATE INDEX "remission_note_items_invoice_item_id_idx" ON "remission_note_items"("invoice_item_id");

-- CreateIndex
CREATE INDEX "billing_document_events_tenant_id_remission_note_id_created_idx" ON "billing_document_events"("tenant_id", "remission_note_id", "created_at");

-- AddForeignKey
ALTER TABLE "billing_document_events" ADD CONSTRAINT "billing_document_events_remission_note_id_fkey" FOREIGN KEY ("remission_note_id") REFERENCES "remission_notes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remission_notes" ADD CONSTRAINT "remission_notes_pdf_file_id_fkey" FOREIGN KEY ("pdf_file_id") REFERENCES "file_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remission_notes" ADD CONSTRAINT "remission_notes_physical_scan_file_id_fkey" FOREIGN KEY ("physical_scan_file_id") REFERENCES "file_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remission_notes" ADD CONSTRAINT "remission_notes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remission_notes" ADD CONSTRAINT "remission_notes_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remission_notes" ADD CONSTRAINT "remission_notes_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "billing_series"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remission_notes" ADD CONSTRAINT "remission_notes_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remission_notes" ADD CONSTRAINT "remission_notes_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remission_notes" ADD CONSTRAINT "remission_notes_from_warehouse_id_fkey" FOREIGN KEY ("from_warehouse_id") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remission_notes" ADD CONSTRAINT "remission_notes_to_warehouse_id_fkey" FOREIGN KEY ("to_warehouse_id") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remission_note_items" ADD CONSTRAINT "remission_note_items_remission_note_id_fkey" FOREIGN KEY ("remission_note_id") REFERENCES "remission_notes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remission_note_items" ADD CONSTRAINT "remission_note_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remission_note_items" ADD CONSTRAINT "remission_note_items_invoice_item_id_fkey" FOREIGN KEY ("invoice_item_id") REFERENCES "invoice_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
