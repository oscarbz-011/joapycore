-- Entrega de cada evento del outbox por consumidor: un reintento solo vuelve
-- a llamar a los que fallaron. Los eventos pendientes no necesitan datos:
-- sin filas, todos sus consumidores se llaman como antes.
-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('DONE', 'FAILED');

-- CreateTable
CREATE TABLE "outbox_deliveries" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "consumer" TEXT NOT NULL,
    "status" "DeliveryStatus" NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "last_error" TEXT,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outbox_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "outbox_deliveries_event_id_consumer_key" ON "outbox_deliveries"("event_id", "consumer");

-- AddForeignKey
ALTER TABLE "outbox_deliveries" ADD CONSTRAINT "outbox_deliveries_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "outbox_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
