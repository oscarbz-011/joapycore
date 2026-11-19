-- Cuándo se fijó la última coordenada: una corrección vieja de una entrega
-- no pisa una más nueva.
ALTER TABLE "customers" ADD COLUMN "location_updated_at" TIMESTAMP(3);
