-- Canales de venta que se habilitan solos al recibir la primera mercadería.
-- Vacío = nada pendiente (todos los productos existentes).
ALTER TABLE "products"
ADD COLUMN "sales_channels_on_receipt" "OrderChannel"[] NOT NULL DEFAULT ARRAY[]::"OrderChannel"[];
