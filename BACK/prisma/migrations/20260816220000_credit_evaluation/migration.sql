-- AlterEnum
ALTER TYPE "SaleOrderStatus" ADD VALUE 'CREDIT_NEEDS_ADJUSTMENT';

-- CreateEnum
CREATE TYPE "CreditAdjustmentSuggestion" AS ENUM ('LOWER_VALUE_PRODUCT', 'MORE_INSTALLMENTS', 'ADD_GUARANTOR');

-- CreateEnum
CREATE TYPE "CreditBureauCheckFrequency" AS ENUM ('FIRST_PURCHASE_ONLY', 'EVERY_REQUEST');

-- CreateEnum
CREATE TYPE "CreditBureauCheckResult" AS ENUM ('CLEAN', 'FLAGGED');

-- AlterTable
ALTER TABLE "sale_orders" ADD COLUMN     "adjustment_note" TEXT,
ADD COLUMN     "suggested_alternatives" "CreditAdjustmentSuggestion"[];

-- AlterTable
ALTER TABLE "credit_configs" ADD COLUMN     "max_income_percentage" DECIMAL(5,2);

-- CreateTable
CREATE TABLE "guarantors" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "sale_order_id" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "document_type" "DocumentType" NOT NULL,
    "document_number" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "monthly_income" DECIMAL(12,2),
    "address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guarantors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_bureau_configs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT false,
    "check_frequency" "CreditBureauCheckFrequency" NOT NULL DEFAULT 'EVERY_REQUEST',
    "provider_name" TEXT NOT NULL DEFAULT 'manual',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_bureau_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_bureau_checks" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "sale_order_id" TEXT,
    "performed_by_id" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'manual',
    "result" "CreditBureauCheckResult" NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_bureau_checks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "credit_bureau_configs_tenant_id_key" ON "credit_bureau_configs"("tenant_id");

-- AddForeignKey
ALTER TABLE "guarantors" ADD CONSTRAINT "guarantors_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guarantors" ADD CONSTRAINT "guarantors_sale_order_id_fkey" FOREIGN KEY ("sale_order_id") REFERENCES "sale_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_bureau_configs" ADD CONSTRAINT "credit_bureau_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_bureau_checks" ADD CONSTRAINT "credit_bureau_checks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_bureau_checks" ADD CONSTRAINT "credit_bureau_checks_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_bureau_checks" ADD CONSTRAINT "credit_bureau_checks_sale_order_id_fkey" FOREIGN KEY ("sale_order_id") REFERENCES "sale_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
