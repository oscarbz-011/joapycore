-- CreateEnum
CREATE TYPE "EconomicActivity" AS ENUM ('ASALARIADO', 'FUNCIONARIO_PUBLICO', 'PROFESIONAL_INDEPENDIENTE', 'COMERCIANTE');

-- AlterTable
ALTER TABLE "customers" ADD COLUMN "economic_activity" "EconomicActivity",
ADD COLUMN "has_ips_insurance" BOOLEAN,
ADD COLUMN "employer_name" TEXT,
ADD COLUMN "supervisor_name" TEXT,
ADD COLUMN "work_phone" TEXT,
ADD COLUMN "work_address" TEXT,
ADD COLUMN "work_seniority" TEXT;
