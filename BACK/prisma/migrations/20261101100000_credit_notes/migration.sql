-- CreateEnum
CREATE TYPE "CreditNoteKind" AS ENUM ('TOTAL', 'ITEMS', 'AMOUNT');

-- CreateEnum
CREATE TYPE "CustomerCreditSource" AS ENUM ('CREDIT_NOTE', 'INVOICE_VOID', 'APPLIED');

-- CreateEnum
CREATE TYPE "BillingEventType" AS ENUM ('ISSUED', 'NUMBERED', 'FORM_PRINTED', 'SHEET_VOIDED', 'SCAN_ATTACHED', 'SCAN_REMOVED', 'VOIDED', 'CREDIT_NOTE_ISSUED', 'REFUNDED', 'CUSTOMER_CREDITED');

-- AlterTable
ALTER TABLE "credit_notes" ADD COLUMN     "applied_to_balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "customer_id" TEXT,
ADD COLUMN     "establecimiento" TEXT,
ADD COLUMN     "form_print_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "form_printed_at" TIMESTAMP(3),
ADD COLUMN     "issued_by_id" TEXT,
ADD COLUMN     "kind" "CreditNoteKind" NOT NULL DEFAULT 'TOTAL',
ADD COLUMN     "modality" "BillingModality",
ADD COLUMN     "number_prefix" TEXT,
ADD COLUMN     "pdf_file_id" TEXT,
ADD COLUMN     "physical_scan_file_id" TEXT,
ADD COLUMN     "punto_expedicion" TEXT,
ADD COLUMN     "sequential" INTEGER,
ADD COLUMN     "serie_code" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "series_id" TEXT,
ADD COLUMN     "timbrado" TEXT,
ADD COLUMN     "timbrado_valid_from" TIMESTAMP(3),
ADD COLUMN     "timbrado_valid_until" TIMESTAMP(3),
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "invoice_items" ADD COLUMN     "sale_order_item_id" TEXT;

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "credited_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "void_reason" TEXT,
ADD COLUMN     "voided_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "credit_note_items" (
    "id" TEXT NOT NULL,
    "credit_note_id" TEXT NOT NULL,
    "invoice_item_id" TEXT,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "iva_rate" DECIMAL(5,2),
    "iva_amount" DECIMAL(12,2),
    "restock_quantity" INTEGER NOT NULL DEFAULT 0,
    "serial_numbers" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "credit_note_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_credit_entries" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "source" "CustomerCreditSource" NOT NULL,
    "credit_note_id" TEXT,
    "invoice_id" TEXT,
    "note" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_credit_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_refunds" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "credit_note_id" TEXT,
    "invoice_id" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_document_events" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "invoice_id" TEXT,
    "credit_note_id" TEXT,
    "type" "BillingEventType" NOT NULL,
    "detail" JSONB,
    "user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_document_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "credit_note_items_credit_note_id_idx" ON "credit_note_items"("credit_note_id");

-- CreateIndex
CREATE INDEX "credit_note_items_invoice_item_id_idx" ON "credit_note_items"("invoice_item_id");

-- CreateIndex
CREATE INDEX "customer_credit_entries_tenant_id_customer_id_idx" ON "customer_credit_entries"("tenant_id", "customer_id");

-- CreateIndex
CREATE INDEX "billing_refunds_tenant_id_idx" ON "billing_refunds"("tenant_id");

-- CreateIndex
CREATE INDEX "billing_refunds_invoice_id_idx" ON "billing_refunds"("invoice_id");

-- CreateIndex
CREATE INDEX "billing_document_events_tenant_id_invoice_id_created_at_idx" ON "billing_document_events"("tenant_id", "invoice_id", "created_at");

-- CreateIndex
CREATE INDEX "billing_document_events_tenant_id_credit_note_id_created_at_idx" ON "billing_document_events"("tenant_id", "credit_note_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "credit_notes_pdf_file_id_key" ON "credit_notes"("pdf_file_id");

-- CreateIndex
CREATE UNIQUE INDEX "credit_notes_physical_scan_file_id_key" ON "credit_notes"("physical_scan_file_id");

-- CreateIndex
CREATE UNIQUE INDEX "credit_notes_series_id_serie_code_sequential_key" ON "credit_notes"("series_id", "serie_code", "sequential");

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_pdf_file_id_fkey" FOREIGN KEY ("pdf_file_id") REFERENCES "file_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_physical_scan_file_id_fkey" FOREIGN KEY ("physical_scan_file_id") REFERENCES "file_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "billing_series"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note_items" ADD CONSTRAINT "credit_note_items_credit_note_id_fkey" FOREIGN KEY ("credit_note_id") REFERENCES "credit_notes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note_items" ADD CONSTRAINT "credit_note_items_invoice_item_id_fkey" FOREIGN KEY ("invoice_item_id") REFERENCES "invoice_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_credit_entries" ADD CONSTRAINT "customer_credit_entries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_credit_entries" ADD CONSTRAINT "customer_credit_entries_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_credit_entries" ADD CONSTRAINT "customer_credit_entries_credit_note_id_fkey" FOREIGN KEY ("credit_note_id") REFERENCES "credit_notes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_credit_entries" ADD CONSTRAINT "customer_credit_entries_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_refunds" ADD CONSTRAINT "billing_refunds_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_refunds" ADD CONSTRAINT "billing_refunds_credit_note_id_fkey" FOREIGN KEY ("credit_note_id") REFERENCES "credit_notes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_refunds" ADD CONSTRAINT "billing_refunds_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_document_events" ADD CONSTRAINT "billing_document_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_document_events" ADD CONSTRAINT "billing_document_events_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_document_events" ADD CONSTRAINT "billing_document_events_credit_note_id_fkey" FOREIGN KEY ("credit_note_id") REFERENCES "credit_notes"("id") ON DELETE SET NULL ON UPDATE CASCADE;



-- Vincula los ítems ya facturados con el ítem del pedido: mismo pedido,
-- descripción y cantidad, en orden. Los que no coinciden (un producto
-- renombrado) quedan sin vínculo y no se pueden reingresar al stock.
WITH inv AS (
  SELECT ii.id, i.sale_order_id, ii.description, ii.quantity,
         ROW_NUMBER() OVER (
           PARTITION BY i.sale_order_id, ii.description, ii.quantity
           ORDER BY ii.id
         ) AS rn
  FROM "invoice_items" ii
  JOIN "invoices" i ON i.id = ii.invoice_id
  WHERE i.sale_order_id IS NOT NULL
), soi AS (
  SELECT s.id, s.sale_order_id,
         COALESCE(p.name, s.description, 'Ítem') AS description, s.quantity,
         ROW_NUMBER() OVER (
           PARTITION BY s.sale_order_id, COALESCE(p.name, s.description, 'Ítem'), s.quantity
           ORDER BY s.id
         ) AS rn
  FROM "sale_order_items" s
  LEFT JOIN "products" p ON p.id = s.product_id
)
UPDATE "invoice_items" t
SET "sale_order_item_id" = soi.id
FROM inv
JOIN soi ON soi.sale_order_id = inv.sale_order_id
        AND soi.description = inv.description
        AND soi.quantity = inv.quantity
        AND soi.rn = inv.rn
WHERE t.id = inv.id;

-- Total acreditado y cliente de las notas de crédito que ya existían.
UPDATE "invoices" i
SET "credited_total" = LEAST(i.total, c.total)
FROM (
  SELECT invoice_id, SUM(total) AS total FROM "credit_notes" GROUP BY invoice_id
) c
WHERE c.invoice_id = i.id;

UPDATE "credit_notes" cn
SET "customer_id" = so.customer_id
FROM "invoices" i
JOIN "sale_orders" so ON so.id = i.sale_order_id
WHERE cn.invoice_id = i.id AND cn.customer_id IS NULL;
