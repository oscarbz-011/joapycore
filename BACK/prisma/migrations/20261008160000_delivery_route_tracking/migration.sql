-- La ruta pasa a ser la salida de un repartidor: código automático, estado e
-- historial. Ya no se separa por turnos ni lleva nombre, y la entrega deja de
-- tener fecha programada propia (la fecha es la de su ruta).
CREATE TYPE "DeliveryRouteStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE "DeliveryRouteEventType" AS ENUM ('CREATED', 'STOP_ADDED', 'STOP_REMOVED', 'REORDERED', 'DRIVER_CHANGED', 'DATE_CHANGED', 'STARTED', 'STOP_DELIVERED', 'STOP_FAILED', 'COMPLETED', 'CANCELLED');

ALTER TABLE "delivery_routes"
ADD COLUMN "code" TEXT,
ADD COLUMN "status" "DeliveryRouteStatus" NOT NULL DEFAULT 'OPEN',
ADD COLUMN "started_at" TIMESTAMP(3),
ADD COLUMN "finished_at" TIMESTAMP(3);

-- Las rutas que ya existían reciben su código en el orden en que se crearon.
UPDATE "delivery_routes" AS r
SET "code" = n."code"
FROM (
  SELECT "id",
         'RUT-' || to_char("created_at", 'YY') || '-' ||
         lpad((row_number() OVER (
           PARTITION BY "tenant_id"
           ORDER BY "created_at", "id"
         ))::text, 6, '0') AS "code"
  FROM "delivery_routes"
) AS n
WHERE n."id" = r."id";

ALTER TABLE "delivery_routes" ALTER COLUMN "code" SET NOT NULL;
ALTER TABLE "delivery_routes" DROP COLUMN "shift", DROP COLUMN "name";

CREATE UNIQUE INDEX "delivery_routes_tenant_id_code_key" ON "delivery_routes"("tenant_id", "code");
CREATE INDEX "delivery_routes_tenant_id_status_idx" ON "delivery_routes"("tenant_id", "status");
CREATE INDEX "delivery_routes_tenant_id_driver_employee_id_status_idx" ON "delivery_routes"("tenant_id", "driver_employee_id", "status");

DROP INDEX "delivery_notes_tenant_id_scheduled_date_idx";
ALTER TABLE "delivery_notes" DROP COLUMN "scheduled_date", DROP COLUMN "scheduled_shift";
DROP TYPE "DeliveryShift";

CREATE TABLE "delivery_route_events" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "route_id" TEXT NOT NULL,
    "type" "DeliveryRouteEventType" NOT NULL,
    "delivery_note_id" TEXT,
    "detail" TEXT,
    "reason" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_route_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "delivery_route_events_tenant_id_route_id_created_at_idx" ON "delivery_route_events"("tenant_id", "route_id", "created_at");

ALTER TABLE "delivery_route_events" ADD CONSTRAINT "delivery_route_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "delivery_route_events" ADD CONSTRAINT "delivery_route_events_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "delivery_routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "delivery_route_events" ADD CONSTRAINT "delivery_route_events_delivery_note_id_fkey" FOREIGN KEY ("delivery_note_id") REFERENCES "delivery_notes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "delivery_route_events" ADD CONSTRAINT "delivery_route_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
