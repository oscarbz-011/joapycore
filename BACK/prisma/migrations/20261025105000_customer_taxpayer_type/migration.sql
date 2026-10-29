-- CreateEnum
CREATE TYPE "TaxpayerType" AS ENUM ('INDIVIDUAL', 'COMPANY');

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "taxpayer_type" "TaxpayerType";
