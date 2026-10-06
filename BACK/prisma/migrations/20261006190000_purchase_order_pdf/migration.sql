-- PDF de la orden de compra y su tipo de plantilla.
ALTER TYPE "TemplateKind" ADD VALUE IF NOT EXISTS 'PURCHASE_ORDER';

ALTER TABLE "purchase_orders" ADD COLUMN "pdf_file_id" TEXT;
