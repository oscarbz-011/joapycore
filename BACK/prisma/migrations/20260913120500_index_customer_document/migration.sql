-- Búsqueda de clientes por documento (validación de duplicados en el alta).
CREATE INDEX IF NOT EXISTS "customers_tenant_id_document_number_idx" ON "customers"("tenant_id", "document_number");
