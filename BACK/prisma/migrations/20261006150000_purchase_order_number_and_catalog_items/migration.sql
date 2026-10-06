-- Número de orden de compra (OC-AA-000001) y copia del ítem del catálogo del
-- proveedor en cada línea.
ALTER TABLE "purchase_orders" ADD COLUMN "order_number" TEXT;

ALTER TABLE "purchase_order_items"
ADD COLUMN "catalog_item_id" TEXT,
ADD COLUMN "supplier_sku" TEXT,
ADD COLUMN "supplier_description" TEXT;

-- Las órdenes que ya existían reciben su número en el orden en que se
-- crearon, por empresa, con el año de su creación.
WITH numbered AS (
  SELECT
    "id",
    'OC-' || to_char("created_at", 'YY') || '-' ||
      lpad(
        (row_number() OVER (PARTITION BY "tenant_id" ORDER BY "created_at", "id"))::text,
        6,
        '0'
      ) AS "number"
  FROM "purchase_orders"
)
UPDATE "purchase_orders" AS po
SET "order_number" = numbered."number"
FROM numbered
WHERE po."id" = numbered."id";

CREATE UNIQUE INDEX "purchase_orders_tenant_id_order_number_key"
ON "purchase_orders"("tenant_id", "order_number");
