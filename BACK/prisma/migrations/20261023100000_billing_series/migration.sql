-- CreateEnum
CREATE TYPE "BillingDocumentType" AS ENUM ('INVOICE', 'CREDIT_NOTE');

-- CreateEnum
CREATE TYPE "BillingModality" AS ENUM ('PREPRINTED', 'SELF_PRINTED', 'ELECTRONIC');

-- CreateTable
CREATE TABLE "billing_series" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "document_type" "BillingDocumentType" NOT NULL DEFAULT 'INVOICE',
    "modality" "BillingModality" NOT NULL,
    "timbrado" TEXT,
    "valid_from" TIMESTAMP(3),
    "valid_until" TIMESTAMP(3),
    "establecimiento" TEXT NOT NULL,
    "punto_expedicion" TEXT NOT NULL,
    "serie_code" TEXT NOT NULL DEFAULT '',
    "range_from" INTEGER NOT NULL,
    "range_to" INTEGER NOT NULL,
    "next_number" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_series_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "billing_series_tenant_id_branch_id_document_type_is_active_idx" ON "billing_series"("tenant_id", "branch_id", "document_type", "is_active");
CREATE UNIQUE INDEX "billing_series_tenant_id_timbrado_establecimiento_punto_exp_key" ON "billing_series"("tenant_id", "timbrado", "establecimiento", "punto_expedicion", "document_type", "serie_code");

ALTER TABLE "billing_series" ADD CONSTRAINT "billing_series_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "billing_series" ADD CONSTRAINT "billing_series_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "modality" "BillingModality",
ADD COLUMN     "serie_code" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "series_id" TEXT,
ADD COLUMN     "timbrado" TEXT,
ADD COLUMN     "timbrado_valid_from" TIMESTAMP(3),
ADD COLUMN     "timbrado_valid_until" TIMESTAMP(3);

-- Hasta ahora el sistema numeraba solo (último + 1) con el timbrado único
-- del tenant: eso equivale a una serie de impresión propia por cada
-- establecimiento y punto de expedición ya usado. El rango autorizado no se
-- conocía, así que queda abierto; next_number continúa la numeración.
WITH used AS (
  SELECT tenant_id, establecimiento, punto_expedicion, MAX(sequential) AS last_seq
  FROM invoices
  WHERE sequential IS NOT NULL
    AND establecimiento IS NOT NULL
    AND punto_expedicion IS NOT NULL
  GROUP BY tenant_id, establecimiento, punto_expedicion
)
INSERT INTO "billing_series" (
  "id", "tenant_id", "branch_id", "document_type", "modality", "timbrado",
  "valid_from", "valid_until", "establecimiento", "punto_expedicion",
  "range_from", "range_to", "next_number", "updated_at"
)
SELECT
  gen_random_uuid()::text, u.tenant_id, b.id, 'INVOICE', 'SELF_PRINTED',
  t.timbrado_numero, date_trunc('day', t.timbrado_fecha), date_trunc('day', t.timbrado_fecha_fin),
  u.establecimiento, u.punto_expedicion,
  1, GREATEST(9999999, u.last_seq), u.last_seq + 1, CURRENT_TIMESTAMP
FROM used u
JOIN tenants t ON t.id = u.tenant_id
CROSS JOIN LATERAL (
  SELECT br.id
  FROM branches br
  WHERE br.tenant_id = u.tenant_id
  ORDER BY
    (br.codigo_establecimiento = u.establecimiento
      AND COALESCE(br.punto_expedicion, '001') = u.punto_expedicion) DESC NULLS LAST,
    (br.codigo_establecimiento = u.establecimiento) DESC NULLS LAST,
    br.is_main DESC,
    br.created_at ASC
  LIMIT 1
) b;

-- Sucursales con establecimiento configurado que todavía no facturaron.
INSERT INTO "billing_series" (
  "id", "tenant_id", "branch_id", "document_type", "modality", "timbrado",
  "valid_from", "valid_until", "establecimiento", "punto_expedicion",
  "range_from", "range_to", "next_number", "updated_at"
)
SELECT DISTINCT ON (br.tenant_id, br.codigo_establecimiento, COALESCE(br.punto_expedicion, '001'))
  gen_random_uuid()::text, br.tenant_id, br.id, 'INVOICE', 'SELF_PRINTED',
  t.timbrado_numero, date_trunc('day', t.timbrado_fecha), date_trunc('day', t.timbrado_fecha_fin),
  br.codigo_establecimiento, COALESCE(br.punto_expedicion, '001'),
  1, 9999999, 1, CURRENT_TIMESTAMP
FROM branches br
JOIN tenants t ON t.id = br.tenant_id
WHERE br.codigo_establecimiento IS NOT NULL
  AND br.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM billing_series s
    WHERE s.tenant_id = br.tenant_id
      AND s.establecimiento = br.codigo_establecimiento
      AND s.punto_expedicion = COALESCE(br.punto_expedicion, '001')
      AND s.document_type = 'INVOICE'
  )
ORDER BY br.tenant_id, br.codigo_establecimiento, COALESCE(br.punto_expedicion, '001'), br.is_main DESC, br.created_at ASC;

UPDATE "invoices" i
SET "series_id" = s.id,
    "modality" = 'SELF_PRINTED',
    "timbrado" = s.timbrado,
    "timbrado_valid_from" = s.valid_from,
    "timbrado_valid_until" = s.valid_until
FROM "billing_series" s
WHERE i.sequential IS NOT NULL
  AND s.tenant_id = i.tenant_id
  AND s.establecimiento = i.establecimiento
  AND s.punto_expedicion = i.punto_expedicion
  AND s.document_type = 'INVOICE';

-- Facturación pasa a activarse junto con Ventas.
UPDATE "tenant_modules" tm
SET "active" = true, "activated_at" = COALESCE(tm.activated_at, CURRENT_TIMESTAMP)
WHERE tm.module_name = 'billing'
  AND tm.active = false
  AND EXISTS (
    SELECT 1 FROM tenant_modules s
    WHERE s.tenant_id = tm.tenant_id AND s.module_name = 'sales' AND s.active
  );

INSERT INTO "tenant_modules" ("id", "tenant_id", "module_name", "active", "activated_at")
SELECT gen_random_uuid()::text, s.tenant_id, 'billing', true, CURRENT_TIMESTAMP
FROM tenant_modules s
WHERE s.module_name = 'sales'
  AND s.active
  AND NOT EXISTS (
    SELECT 1 FROM tenant_modules b
    WHERE b.tenant_id = s.tenant_id AND b.module_name = 'billing'
  );

-- La numeración pasa a ser única por serie (un timbrado nuevo puede repetir
-- números del anterior).
-- La migración que lo creó (20260818020000) y `db push` le dieron nombres
-- distintos al truncar a 63 caracteres.
DROP INDEX IF EXISTS "invoices_tenant_id_establecimiento_punto_expedicion_sequen_key";
DROP INDEX IF EXISTS "invoices_tenant_id_establecimiento_punto_expedicion_sequent_key";
CREATE INDEX "invoices_tenant_id_series_id_idx" ON "invoices"("tenant_id", "series_id");
CREATE UNIQUE INDEX "invoices_series_id_serie_code_sequential_key" ON "invoices"("series_id", "serie_code", "sequential");
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "billing_series"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- El timbrado ahora vive en las series.
ALTER TABLE "tenants" DROP COLUMN "timbrado_fecha",
DROP COLUMN "timbrado_fecha_fin",
DROP COLUMN "timbrado_numero";
