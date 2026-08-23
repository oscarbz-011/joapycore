-- Formato de impresión: Factura A4 (timbrado con vigencia fin + punto de
-- expedición por sucursal) y Recibo de Dinero por cobro de cuota.

ALTER TABLE "tenants" ADD COLUMN "timbrado_fecha_fin" TIMESTAMP(3);
ALTER TABLE "branches" ADD COLUMN "punto_expedicion" TEXT NOT NULL DEFAULT '001';

CREATE TABLE "payment_receipts" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "loan_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "establecimiento" TEXT NOT NULL,
    "punto_expedicion" TEXT NOT NULL,
    "sequential" INTEGER NOT NULL,
    "receipt_number" TEXT NOT NULL,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "payment_method" "PaymentMethod" NOT NULL,
    "payment_reference" TEXT,
    "collected_by_id" TEXT,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_receipts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payment_receipt_items" (
    "id" TEXT NOT NULL,
    "receipt_id" TEXT NOT NULL,
    "installment_id" TEXT NOT NULL,
    "installment_number" INTEGER NOT NULL,
    "amount_applied" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "payment_receipt_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_receipts_tenant_id_establecimiento_punto_expedicio_key"
    ON "payment_receipts"("tenant_id", "establecimiento", "punto_expedicion", "sequential");

ALTER TABLE "payment_receipts" ADD CONSTRAINT "payment_receipts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_receipts" ADD CONSTRAINT "payment_receipts_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_receipts" ADD CONSTRAINT "payment_receipts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_receipts" ADD CONSTRAINT "payment_receipts_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payment_receipts" ADD CONSTRAINT "payment_receipts_collected_by_id_fkey" FOREIGN KEY ("collected_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payment_receipt_items" ADD CONSTRAINT "payment_receipt_items_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "payment_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_receipt_items" ADD CONSTRAINT "payment_receipt_items_installment_id_fkey" FOREIGN KEY ("installment_id") REFERENCES "installments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
