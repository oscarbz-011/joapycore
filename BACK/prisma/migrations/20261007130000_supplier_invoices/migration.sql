-- Factura del proveedor: vuelve definitiva la cuenta por pagar que nació
-- estimada al recibir. Si difiere de lo recibido, espera aprobación.
CREATE TYPE "SupplierInvoiceStatus" AS ENUM ('MATCHED', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED');

CREATE TABLE "supplier_invoices" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "timbrado" TEXT,
    "invoice_date" TIMESTAMP(3) NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "shipping_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "estimated_total" DECIMAL(12,2) NOT NULL,
    "status" "SupplierInvoiceStatus" NOT NULL,
    "notes" TEXT,
    "review_note" TEXT,
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_invoices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "supplier_invoice_items" (
    "id" TEXT NOT NULL,
    "supplier_invoice_id" TEXT NOT NULL,
    "purchase_receipt_item_id" TEXT NOT NULL,
    "accounts_payable_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_cost" DECIMAL(12,2) NOT NULL,
    "received_quantity" INTEGER NOT NULL,
    "received_unit_cost" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "supplier_invoice_items_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "accounts_payable"
ADD COLUMN "supplier_invoice_id" TEXT,
ADD COLUMN "estimated_amount" DECIMAL(12,2);

CREATE INDEX "supplier_invoices_tenant_id_supplier_id_invoice_number_idx" ON "supplier_invoices"("tenant_id", "supplier_id", "invoice_number");
CREATE INDEX "supplier_invoices_tenant_id_status_idx" ON "supplier_invoices"("tenant_id", "status");
CREATE INDEX "supplier_invoice_items_supplier_invoice_id_idx" ON "supplier_invoice_items"("supplier_invoice_id");
CREATE INDEX "supplier_invoice_items_purchase_receipt_item_id_idx" ON "supplier_invoice_items"("purchase_receipt_item_id");
CREATE INDEX "accounts_payable_supplier_invoice_id_idx" ON "accounts_payable"("supplier_invoice_id");

-- El número de factura no se repite por proveedor, salvo entre rechazadas:
-- una factura rechazada se puede volver a cargar corregida.
CREATE UNIQUE INDEX "supplier_invoices_active_number_key"
ON "supplier_invoices"("tenant_id", "supplier_id", "invoice_number")
WHERE "status" <> 'REJECTED';

ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "supplier_invoice_items" ADD CONSTRAINT "supplier_invoice_items_supplier_invoice_id_fkey" FOREIGN KEY ("supplier_invoice_id") REFERENCES "supplier_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_invoice_items" ADD CONSTRAINT "supplier_invoice_items_purchase_receipt_item_id_fkey" FOREIGN KEY ("purchase_receipt_item_id") REFERENCES "purchase_receipt_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_invoice_items" ADD CONSTRAINT "supplier_invoice_items_accounts_payable_id_fkey" FOREIGN KEY ("accounts_payable_id") REFERENCES "accounts_payable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "accounts_payable" ADD CONSTRAINT "accounts_payable_supplier_invoice_id_fkey" FOREIGN KEY ("supplier_invoice_id") REFERENCES "supplier_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
