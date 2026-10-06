-- Descuento del proveedor según la cantidad de unidades de la orden.
ALTER TABLE "suppliers"
ADD COLUMN "quantity_discounts" JSONB NOT NULL DEFAULT '[]';
