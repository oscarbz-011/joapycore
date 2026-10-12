-- Presupuestos para personas o empresas que todavía no son clientes: sus
-- datos se cargan a mano en el propio presupuesto.
ALTER TABLE "sale_orders"
ADD COLUMN "prospect_name" TEXT,
ADD COLUMN "prospect_document" TEXT,
ADD COLUMN "prospect_phone" TEXT,
ADD COLUMN "prospect_email" TEXT,
ADD COLUMN "prospect_address" TEXT;
