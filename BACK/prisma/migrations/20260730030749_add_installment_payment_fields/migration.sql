/*
  Warnings:

  - You are about to drop the column `tax_id` on the `customers` table. All the data in the column will be lost.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentMethod" ADD VALUE 'PAGO_EXPRESS';
ALTER TYPE "PaymentMethod" ADD VALUE 'AQUI_PAGO';
ALTER TYPE "PaymentMethod" ADD VALUE 'DEPOSITO';
ALTER TYPE "PaymentMethod" ADD VALUE 'CHEQUE';

-- AlterTable
ALTER TABLE "customers" DROP COLUMN "tax_id";

-- AlterTable
ALTER TABLE "installments" ADD COLUMN     "payment_date" TIMESTAMP(3),
ADD COLUMN     "payment_method" "PaymentMethod",
ADD COLUMN     "payment_reference" TEXT,
ALTER COLUMN "due_date" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "paid_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "loans" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);
