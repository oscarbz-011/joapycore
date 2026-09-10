-- CreateEnum
CREATE TYPE "ProductKind" AS ENUM ('RESALE', 'RAW_MATERIAL', 'MANUFACTURED');

CREATE TYPE "Industry" AS ENUM (
  'ELECTRODOMESTICOS', 'FERRETERIA', 'SUPERMERCADO', 'MUEBLERIA', 'SERVICIOS', 'OTRO'
);

-- AlterTable: clasificación del producto (multi-rubro)
ALTER TABLE "products" ADD COLUMN "kind" "ProductKind" NOT NULL DEFAULT 'RESALE';
ALTER TABLE "products" ADD COLUMN "is_purchasable" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "products" ADD COLUMN "is_sellable" BOOLEAN NOT NULL DEFAULT true;

-- Los productos existentes son todos de reventa: los tenants actuales son de
-- rubros que compran terminado (electrodomésticos, ferretería, supermercado).
-- El default de la columna ya deja RESALE/comprable/vendible, así que no hace
-- falta UPDATE — se deja explícito el criterio para el que lea la migración.

-- AlterTable: industry de texto libre a enum.
-- Valores presentes en la base al momento de migrar: electrodomesticos,
-- ferreteria, supermercado, servicios, otro, default. 'default' era el fallback
-- del seed de categorías cuando el rubro no matcheaba, no un rubro real → OTRO.
-- Cualquier valor no contemplado cae también en OTRO, pero NULL se preserva
-- como NULL: "no eligió rubro" no es lo mismo que "eligió Otro".
ALTER TABLE "tenants" ALTER COLUMN "industry" TYPE "Industry" USING (
  CASE
    WHEN "industry" IS NULL THEN NULL
    WHEN lower(trim("industry")) = 'electrodomesticos' THEN 'ELECTRODOMESTICOS'
    WHEN lower(trim("industry")) = 'ferreteria'        THEN 'FERRETERIA'
    WHEN lower(trim("industry")) = 'supermercado'      THEN 'SUPERMERCADO'
    WHEN lower(trim("industry")) = 'muebleria'         THEN 'MUEBLERIA'
    WHEN lower(trim("industry")) = 'servicios'         THEN 'SERVICIOS'
    ELSE 'OTRO'
  END
)::"Industry";
