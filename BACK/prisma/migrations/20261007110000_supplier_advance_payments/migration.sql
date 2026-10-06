-- Anticipos a proveedores: pago total o parcial de una orden de compra antes
-- de recibir la mercadería, y su devolución.
CREATE TYPE "SupplierPaymentKind" AS ENUM ('PAYMENT', 'ADVANCE', 'ADVANCE_REFUND');

ALTER TABLE "suppliers" ADD COLUMN "advance_percent" DECIMAL(5,2);

ALTER TABLE "purchase_orders"
ADD COLUMN "advance_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;

ALTER TABLE "accounts_payable"
ADD COLUMN "advance_applied" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- Un pago pasa a ser de una cuenta por pagar o de una orden de compra.
ALTER TABLE "supplier_payments"
ALTER COLUMN "accounts_payable_id" DROP NOT NULL,
ADD COLUMN "purchase_order_id" TEXT,
ADD COLUMN "kind" "SupplierPaymentKind" NOT NULL DEFAULT 'PAYMENT';

CREATE INDEX "supplier_payments_purchase_order_id_idx"
ON "supplier_payments"("purchase_order_id");

ALTER TABLE "supplier_payments"
ADD CONSTRAINT "supplier_payments_purchase_order_id_fkey"
FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- Tiene una de las dos referencias, nunca ambas ni ninguna.
ALTER TABLE "supplier_payments"
ADD CONSTRAINT "supplier_payments_one_target_check"
CHECK (("accounts_payable_id" IS NULL) <> ("purchase_order_id" IS NULL));
