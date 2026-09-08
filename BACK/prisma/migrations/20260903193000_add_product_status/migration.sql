-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'BLOCKED');

-- AlterTable: estado de la ficha del producto (no del stock)
ALTER TABLE "products" ADD COLUMN "status" "ProductStatus" NOT NULL DEFAULT 'DRAFT';

-- Los productos que ya existían estaban operativos: is_active=true → ACTIVE,
-- is_active=false (baja lógica) → INACTIVE. Ninguno queda en DRAFT, que es un
-- estado nuevo para fichas creadas incompletas de acá en adelante.
UPDATE "products" SET "status" = CASE WHEN "is_active" THEN 'ACTIVE'::"ProductStatus" ELSE 'INACTIVE'::"ProductStatus" END;

ALTER TABLE "products" DROP COLUMN "is_active";

-- Precios nullable: un producto en DRAFT puede no tener precio todavía.
-- null = "pendiente", distinto de 0 (precio real de cero).
ALTER TABLE "products" ALTER COLUMN "cost_price" DROP NOT NULL;
ALTER TABLE "products" ALTER COLUMN "sale_price" DROP NOT NULL;
