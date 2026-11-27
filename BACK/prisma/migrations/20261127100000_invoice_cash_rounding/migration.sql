-- AlterTable
ALTER TABLE "invoices" ADD COLUMN "rounding" DECIMAL(23,8) NOT NULL DEFAULT 0;
