-- Cómo se entrega una venta: envío a domicilio (lo de siempre), retiro en
-- sucursal por el cliente, o entrega a cargo del vendedor con autorización.
CREATE TYPE "DeliveryMethod" AS ENUM ('HOME_DELIVERY', 'PICKUP', 'SELLER');
CREATE TYPE "SellerDeliveryRequestStatus" AS ENUM ('PENDING', 'AUTHORIZED', 'REJECTED');

ALTER TABLE "delivery_notes"
ADD COLUMN "method" "DeliveryMethod" NOT NULL DEFAULT 'HOME_DELIVERY',
ADD COLUMN "picked_up_by_name" TEXT,
ADD COLUMN "picked_up_by_document" TEXT,
ADD COLUMN "seller_request_status" "SellerDeliveryRequestStatus",
ADD COLUMN "seller_request_note" TEXT,
ADD COLUMN "seller_requested_by_id" TEXT,
ADD COLUMN "seller_requested_at" TIMESTAMP(3),
ADD COLUMN "seller_decided_by_id" TEXT,
ADD COLUMN "seller_decided_at" TIMESTAMP(3),
ADD COLUMN "seller_decision_note" TEXT;

ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_seller_requested_by_id_fkey" FOREIGN KEY ("seller_requested_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_seller_decided_by_id_fkey" FOREIGN KEY ("seller_decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
