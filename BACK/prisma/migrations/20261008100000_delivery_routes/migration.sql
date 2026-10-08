-- Planificación de rutas de entrega: cada entrega a domicilio puede tener
-- fecha y turno, y agruparse con otras en una ruta con su orden de paradas.
CREATE TYPE "DeliveryShift" AS ENUM ('MORNING', 'AFTERNOON');

CREATE TABLE "delivery_routes" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "route_date" DATE NOT NULL,
    "shift" "DeliveryShift" NOT NULL,
    "name" TEXT,
    "driver_employee_id" TEXT,
    "vehicle" TEXT,
    "notes" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_routes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "delivery_routes_tenant_id_route_date_idx" ON "delivery_routes"("tenant_id", "route_date");

ALTER TABLE "delivery_routes" ADD CONSTRAINT "delivery_routes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "delivery_routes" ADD CONSTRAINT "delivery_routes_driver_employee_id_fkey" FOREIGN KEY ("driver_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "delivery_routes" ADD CONSTRAINT "delivery_routes_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "delivery_notes"
ADD COLUMN "scheduled_date" DATE,
ADD COLUMN "scheduled_shift" "DeliveryShift",
ADD COLUMN "route_id" TEXT,
ADD COLUMN "route_order" INTEGER;

CREATE INDEX "delivery_notes_tenant_id_scheduled_date_idx" ON "delivery_notes"("tenant_id", "scheduled_date");
CREATE INDEX "delivery_notes_route_id_idx" ON "delivery_notes"("route_id");

ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "delivery_routes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
