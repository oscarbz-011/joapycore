-- Las cantidades pasan de entero a DECIMAL(18,8): hasta 8 decimales, como la
-- cantidad de un ítem en SIFEN. El entero se convierte sin pérdida.

-- AlterTable
ALTER TABLE "credit_note_items" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(18,8),
ALTER COLUMN "restock_quantity" SET DEFAULT 0,
ALTER COLUMN "restock_quantity" SET DATA TYPE DECIMAL(18,8);

-- AlterTable
ALTER TABLE "invoice_items" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(18,8);

-- AlterTable
ALTER TABLE "product_batches" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(18,8),
ALTER COLUMN "remaining_qty" SET DATA TYPE DECIMAL(18,8);

-- AlterTable
ALTER TABLE "product_components" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(18,8);

-- AlterTable
ALTER TABLE "production_order_items" ALTER COLUMN "planned_quantity" SET DATA TYPE DECIMAL(18,8),
ALTER COLUMN "used_quantity" SET DATA TYPE DECIMAL(18,8);

-- AlterTable
ALTER TABLE "production_orders" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(18,8);

-- AlterTable
ALTER TABLE "products" ALTER COLUMN "stock_min" SET DEFAULT 0,
ALTER COLUMN "stock_min" SET DATA TYPE DECIMAL(18,8),
ALTER COLUMN "stock_initial" SET DEFAULT 0,
ALTER COLUMN "stock_initial" SET DATA TYPE DECIMAL(18,8);

-- AlterTable
ALTER TABLE "purchase_order_items" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(18,8),
ALTER COLUMN "received_qty" SET DEFAULT 0,
ALTER COLUMN "received_qty" SET DATA TYPE DECIMAL(18,8);

-- AlterTable
ALTER TABLE "purchase_receipt_items" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(18,8);

-- AlterTable
ALTER TABLE "remission_note_items" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(18,8),
ALTER COLUMN "received_quantity" SET DATA TYPE DECIMAL(18,8);

-- AlterTable
ALTER TABLE "sale_combo_items" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(18,8);

-- AlterTable
ALTER TABLE "sale_order_items" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(18,8);

-- AlterTable
ALTER TABLE "stock_movements" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(18,8);

-- AlterTable
ALTER TABLE "supplier_catalog_items" ALTER COLUMN "min_order_quantity" SET DATA TYPE DECIMAL(18,8);

-- AlterTable
ALTER TABLE "supplier_catalog_price_tiers" ALTER COLUMN "min_quantity" SET DATA TYPE DECIMAL(18,8);

-- AlterTable
ALTER TABLE "supplier_invoice_items" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(18,8),
ALTER COLUMN "received_quantity" SET DATA TYPE DECIMAL(18,8);

-- AlterTable
ALTER TABLE "supplier_quantity_discounts" ALTER COLUMN "min_quantity" SET DATA TYPE DECIMAL(18,8);
