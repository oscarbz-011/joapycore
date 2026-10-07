-- Estado "Enviada" e historial de estados de la orden de compra.
ALTER TYPE "PurchaseOrderStatus" ADD VALUE IF NOT EXISTS 'SENT' BEFORE 'CONFIRMED';

CREATE TABLE "purchase_order_status_changes" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "purchase_order_id" TEXT NOT NULL,
    "from_status" "PurchaseOrderStatus",
    "to_status" "PurchaseOrderStatus" NOT NULL,
    "reason" TEXT,
    "changed_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_order_status_changes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "purchase_order_status_changes_tenant_id_purchase_order_id_idx"
ON "purchase_order_status_changes"("tenant_id", "purchase_order_id");

ALTER TABLE "purchase_order_status_changes"
ADD CONSTRAINT "purchase_order_status_changes_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_order_status_changes"
ADD CONSTRAINT "purchase_order_status_changes_purchase_order_id_fkey"
FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_order_status_changes"
ADD CONSTRAINT "purchase_order_status_changes_changed_by_id_fkey"
FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Las órdenes que ya existían arrancan su historial con el alta. De los
-- cambios anteriores a esta migración no quedó registro.
INSERT INTO "purchase_order_status_changes"
  ("id", "tenant_id", "purchase_order_id", "from_status", "to_status", "created_at")
SELECT gen_random_uuid()::text, "tenant_id", "id", NULL, 'PENDING', "created_at"
FROM "purchase_orders";
