-- AlterTable: Tenant — datos fiscales SIFEN
ALTER TABLE "tenants"
  ADD COLUMN "nombre_fantasia"            TEXT,
  ADD COLUMN "numero_casa"                TEXT,
  ADD COLUMN "timbrado_numero"            TEXT,
  ADD COLUMN "timbrado_fecha"             TIMESTAMP(3),
  ADD COLUMN "tipo_contribuyente"         INTEGER,
  ADD COLUMN "tipo_regimen"               INTEGER,
  ADD COLUMN "actividades_economicas"     JSONB,
  ADD COLUMN "departamento_codigo"        INTEGER,
  ADD COLUMN "departamento_desc"          TEXT,
  ADD COLUMN "distrito_codigo"            INTEGER,
  ADD COLUMN "distrito_desc"              TEXT,
  ADD COLUMN "ciudad_codigo"              INTEGER,
  ADD COLUMN "ciudad_desc"               TEXT;

-- AlterTable: Branch — datos de establecimiento SIFEN
ALTER TABLE "branches"
  ADD COLUMN "numero_casa"               TEXT,
  ADD COLUMN "email"                     TEXT,
  ADD COLUMN "codigo_establecimiento"    TEXT,
  ADD COLUMN "departamento_codigo"       INTEGER,
  ADD COLUMN "departamento_desc"         TEXT,
  ADD COLUMN "distrito_codigo"           INTEGER,
  ADD COLUMN "distrito_desc"             TEXT,
  ADD COLUMN "ciudad_codigo"             INTEGER,
  ADD COLUMN "ciudad_desc"              TEXT;
