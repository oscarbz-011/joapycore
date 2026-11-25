-- Peso y medidas del producto pasan de Float a Decimal, con los decimales que ya validaba la API.

-- AlterTable
ALTER TABLE "products" ALTER COLUMN "weight_kg" SET DATA TYPE DECIMAL(12,3),
ALTER COLUMN "height_cm" SET DATA TYPE DECIMAL(10,1),
ALTER COLUMN "width_cm" SET DATA TYPE DECIMAL(10,1),
ALTER COLUMN "depth_cm" SET DATA TYPE DECIMAL(10,1);
