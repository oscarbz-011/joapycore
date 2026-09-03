-- CreateEnum
CREATE TYPE "InterestComponentFrequency" AS ENUM ('ONE_TIME', 'DAILY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "PaymentReceiptItemKind" AS ENUM ('PRINCIPAL', 'INTEREST_COMPONENT');

-- CreateEnum
CREATE TYPE "DelinquencyReportStatus" AS ENUM ('PENDING_REVIEW', 'REPORTED', 'EXCLUDED');

-- AlterTable
ALTER TABLE "credit_configs" DROP COLUMN "mora_rate",
ADD COLUMN     "delinquency_threshold_months" INTEGER;

-- AlterTable
ALTER TABLE "installments" DROP COLUMN "last_mora_calculated_at",
DROP COLUMN "mora_amount";

-- AlterTable
ALTER TABLE "payment_receipt_items" ADD COLUMN     "component_name" TEXT,
ADD COLUMN     "kind" "PaymentReceiptItemKind" NOT NULL DEFAULT 'PRINCIPAL';

-- CreateTable
CREATE TABLE "interest_components" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "credit_config_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "frequency" "InterestComponentFrequency" NOT NULL,
    "percentage" DECIMAL(5,2) NOT NULL,
    "cumulative" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interest_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "installment_interest_charges" (
    "id" TEXT NOT NULL,
    "installment_id" TEXT NOT NULL,
    "component_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "periods_elapsed" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "installment_interest_charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delinquency_reports" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "loan_id" TEXT NOT NULL,
    "months_overdue" INTEGER NOT NULL,
    "status" "DelinquencyReportStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "provider" TEXT NOT NULL DEFAULT 'informconf',
    "reference" TEXT,
    "notes" TEXT,
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delinquency_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "installment_interest_charges_installment_id_component_id_key" ON "installment_interest_charges"("installment_id", "component_id");

-- CreateIndex
CREATE UNIQUE INDEX "delinquency_reports_tenant_id_loan_id_key" ON "delinquency_reports"("tenant_id", "loan_id");

-- AddForeignKey
ALTER TABLE "interest_components" ADD CONSTRAINT "interest_components_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interest_components" ADD CONSTRAINT "interest_components_credit_config_id_fkey" FOREIGN KEY ("credit_config_id") REFERENCES "credit_configs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment_interest_charges" ADD CONSTRAINT "installment_interest_charges_installment_id_fkey" FOREIGN KEY ("installment_id") REFERENCES "installments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment_interest_charges" ADD CONSTRAINT "installment_interest_charges_component_id_fkey" FOREIGN KEY ("component_id") REFERENCES "interest_components"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delinquency_reports" ADD CONSTRAINT "delinquency_reports_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delinquency_reports" ADD CONSTRAINT "delinquency_reports_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delinquency_reports" ADD CONSTRAINT "delinquency_reports_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

