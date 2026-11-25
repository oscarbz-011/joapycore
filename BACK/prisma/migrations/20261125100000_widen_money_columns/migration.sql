-- Solo amplía la precisión: montos y precios a DECIMAL(23,8), tasas y porcentajes a
-- DECIMAL(11,8) y el tipo de cambio a DECIMAL(9,4), como en SIFEN.

-- AlterTable
ALTER TABLE "accounts_payable" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(23,8),
ALTER COLUMN "paid_amount" SET DATA TYPE DECIMAL(23,8),
ALTER COLUMN "advance_applied" SET DATA TYPE DECIMAL(23,8),
ALTER COLUMN "estimated_amount" SET DATA TYPE DECIMAL(23,8);

-- AlterTable
ALTER TABLE "accounts_receivable" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(23,8),
ALTER COLUMN "paid_amount" SET DATA TYPE DECIMAL(23,8);

-- AlterTable
ALTER TABLE "billing_refunds" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(23,8);

-- AlterTable
ALTER TABLE "collection_routes" ALTER COLUMN "total_planned" SET DATA TYPE DECIMAL(23,8),
ALTER COLUMN "total_collected" SET DATA TYPE DECIMAL(23,8);

-- AlterTable
ALTER TABLE "collection_visits" ALTER COLUMN "planned_amount" SET DATA TYPE DECIMAL(23,8),
ALTER COLUMN "collected_amount" SET DATA TYPE DECIMAL(23,8);

-- AlterTable
ALTER TABLE "credit_configs" ALTER COLUMN "max_income_percentage" SET DATA TYPE DECIMAL(11,8);

-- AlterTable
ALTER TABLE "credit_note_items" ALTER COLUMN "unit_price" SET DATA TYPE DECIMAL(23,8),
ALTER COLUMN "total" SET DATA TYPE DECIMAL(23,8),
ALTER COLUMN "iva_rate" SET DATA TYPE DECIMAL(11,8),
ALTER COLUMN "iva_amount" SET DATA TYPE DECIMAL(23,8);

-- AlterTable
ALTER TABLE "credit_notes" ALTER COLUMN "total" SET DATA TYPE DECIMAL(23,8),
ALTER COLUMN "applied_to_balance" SET DATA TYPE DECIMAL(23,8);

-- AlterTable
ALTER TABLE "credit_plans" ALTER COLUMN "interest_rate" SET DATA TYPE DECIMAL(11,8);

-- AlterTable
ALTER TABLE "customer_credit_entries" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(23,8);

-- AlterTable
ALTER TABLE "customers" ALTER COLUMN "monthly_income" SET DATA TYPE DECIMAL(23,8),
ALTER COLUMN "credit_limit" SET DATA TYPE DECIMAL(23,8);

-- AlterTable
ALTER TABLE "down_payments" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(23,8);

-- AlterTable
ALTER TABLE "guarantors" ALTER COLUMN "monthly_income" SET DATA TYPE DECIMAL(23,8);

-- AlterTable
ALTER TABLE "installment_interest_charges" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(23,8);

-- AlterTable
ALTER TABLE "installments" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(23,8),
ALTER COLUMN "paid_amount" SET DATA TYPE DECIMAL(23,8);

-- AlterTable
ALTER TABLE "interest_components" ALTER COLUMN "percentage" SET DATA TYPE DECIMAL(11,8);

-- AlterTable
ALTER TABLE "invoice_items" ALTER COLUMN "unit_price" SET DATA TYPE DECIMAL(23,8),
ALTER COLUMN "total" SET DATA TYPE DECIMAL(23,8),
ALTER COLUMN "iva_rate" SET DATA TYPE DECIMAL(11,8),
ALTER COLUMN "iva_amount" SET DATA TYPE DECIMAL(23,8),
ALTER COLUMN "unit_price_without_iva" SET DATA TYPE DECIMAL(23,8);

-- AlterTable
ALTER TABLE "invoices" ALTER COLUMN "total" SET DATA TYPE DECIMAL(23,8),
ALTER COLUMN "credited_total" SET DATA TYPE DECIMAL(23,8);

-- AlterTable
ALTER TABLE "loans" ALTER COLUMN "principal" SET DATA TYPE DECIMAL(23,8),
ALTER COLUMN "interest_rate" SET DATA TYPE DECIMAL(11,8),
ALTER COLUMN "total_amount" SET DATA TYPE DECIMAL(23,8);

-- AlterTable
ALTER TABLE "payment_agreements" ALTER COLUMN "original_debt" SET DATA TYPE DECIMAL(23,8),
ALTER COLUMN "agreed_amount" SET DATA TYPE DECIMAL(23,8);

-- AlterTable
ALTER TABLE "payment_receipt_items" ALTER COLUMN "amount_applied" SET DATA TYPE DECIMAL(23,8);

-- AlterTable
ALTER TABLE "payment_receipts" ALTER COLUMN "total_amount" SET DATA TYPE DECIMAL(23,8);

-- AlterTable
ALTER TABLE "payment_records" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(23,8);

-- AlterTable
ALTER TABLE "payroll_config" ALTER COLUMN "ips_employee_rate" SET DATA TYPE DECIMAL(11,8),
ALTER COLUMN "ips_employer_rate" SET DATA TYPE DECIMAL(11,8);

-- AlterTable
ALTER TABLE "pos_sessions" ALTER COLUMN "opening_cash" SET DATA TYPE DECIMAL(23,8),
ALTER COLUMN "closing_cash" SET DATA TYPE DECIMAL(23,8),
ALTER COLUMN "expected_cash" SET DATA TYPE DECIMAL(23,8),
ALTER COLUMN "difference" SET DATA TYPE DECIMAL(23,8);

-- AlterTable
ALTER TABLE "pricing_configs" ALTER COLUMN "default_markup" SET DATA TYPE DECIMAL(23,8);

-- AlterTable
ALTER TABLE "product_batches" ALTER COLUMN "unit_cost" SET DATA TYPE DECIMAL(23,8);

-- AlterTable
ALTER TABLE "product_suppliers" ALTER COLUMN "cost_price" SET DATA TYPE DECIMAL(23,8);

-- AlterTable
ALTER TABLE "products" ALTER COLUMN "cost_price" SET DATA TYPE DECIMAL(23,8),
ALTER COLUMN "sale_price" SET DATA TYPE DECIMAL(23,8),
ALTER COLUMN "additional_markup" SET DATA TYPE DECIMAL(23,8),
ALTER COLUMN "iva_tax_rate" SET DATA TYPE DECIMAL(11,8);

-- AlterTable
ALTER TABLE "purchase_order_items" ALTER COLUMN "unit_cost" SET DATA TYPE DECIMAL(23,8);

-- AlterTable
ALTER TABLE "purchase_orders" ALTER COLUMN "advance_amount" SET DATA TYPE DECIMAL(23,8),
ALTER COLUMN "exchange_rate" SET DATA TYPE DECIMAL(9,4),
ALTER COLUMN "customs_duty" SET DATA TYPE DECIMAL(11,8);

-- AlterTable
ALTER TABLE "purchase_receipt_items" ALTER COLUMN "unit_cost" SET DATA TYPE DECIMAL(23,8);

-- AlterTable
ALTER TABLE "sale_combos" ALTER COLUMN "fixed_price" SET DATA TYPE DECIMAL(23,8),
ALTER COLUMN "discount_percentage" SET DATA TYPE DECIMAL(11,8);

-- AlterTable
ALTER TABLE "sale_order_items" ALTER COLUMN "unit_price" SET DATA TYPE DECIMAL(23,8),
ALTER COLUMN "iva_rate" SET DATA TYPE DECIMAL(11,8),
ALTER COLUMN "iva_amount" SET DATA TYPE DECIMAL(23,8),
ALTER COLUMN "unit_price_without_iva" SET DATA TYPE DECIMAL(23,8),
ALTER COLUMN "financed_unit_price" SET DATA TYPE DECIMAL(23,8);

-- AlterTable
ALTER TABLE "sale_orders" ALTER COLUMN "interest_rate" SET DATA TYPE DECIMAL(11,8),
ALTER COLUMN "subtotal" SET DATA TYPE DECIMAL(23,8),
ALTER COLUMN "total" SET DATA TYPE DECIMAL(23,8),
ALTER COLUMN "surcharge_amount" SET DATA TYPE DECIMAL(23,8);

-- AlterTable
ALTER TABLE "sale_payments" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(23,8);

-- AlterTable
ALTER TABLE "sale_targets" ALTER COLUMN "target_amount" SET DATA TYPE DECIMAL(23,8);

-- AlterTable
ALTER TABLE "supplier_catalog_items" ALTER COLUMN "price" SET DATA TYPE DECIMAL(23,8);

-- AlterTable
ALTER TABLE "supplier_invoice_items" ALTER COLUMN "unit_cost" SET DATA TYPE DECIMAL(23,8),
ALTER COLUMN "received_unit_cost" SET DATA TYPE DECIMAL(23,8);

-- AlterTable
ALTER TABLE "supplier_invoices" ALTER COLUMN "subtotal" SET DATA TYPE DECIMAL(23,8),
ALTER COLUMN "shipping_amount" SET DATA TYPE DECIMAL(23,8),
ALTER COLUMN "discount_amount" SET DATA TYPE DECIMAL(23,8),
ALTER COLUMN "total" SET DATA TYPE DECIMAL(23,8),
ALTER COLUMN "estimated_total" SET DATA TYPE DECIMAL(23,8);

-- AlterTable
ALTER TABLE "supplier_payments" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(23,8);

-- AlterTable
ALTER TABLE "suppliers" ALTER COLUMN "advance_percent" SET DATA TYPE DECIMAL(11,8),
ALTER COLUMN "shipping_cost" SET DATA TYPE DECIMAL(23,8),
ALTER COLUMN "min_order_amount" SET DATA TYPE DECIMAL(23,8);
