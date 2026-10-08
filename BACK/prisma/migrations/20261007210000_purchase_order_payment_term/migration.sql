-- La condición de pago queda en la orden de compra, copiada del proveedor.
ALTER TABLE "purchase_orders"
ADD COLUMN "payment_term_days" INTEGER NOT NULL DEFAULT 0;

-- Las órdenes que ya existen toman el plazo actual de su proveedor.
UPDATE "purchase_orders" AS po
SET "payment_term_days" = COALESCE(s."payment_term_days", 0)
FROM "suppliers" AS s
WHERE s."id" = po."supplier_id";
