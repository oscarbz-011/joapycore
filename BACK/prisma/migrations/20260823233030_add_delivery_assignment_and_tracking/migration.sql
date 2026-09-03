-- CreateEnum
CREATE TYPE "DeliveryAssignmentMode" AS ENUM ('INTERNAL_EMPLOYEE', 'EXTERNAL_COURIER_USER', 'EXTERNAL_COMPANY');

-- CreateEnum
CREATE TYPE "DeliveryEventSource" AS ENUM ('MANUAL', 'GPS_AUTO');

-- CreateEnum
CREATE TYPE "DeliveryCheckpoint" AS ENUM ('LEFT_WAREHOUSE', 'IN_TRANSIT', 'ARRIVED', 'DELIVERED');

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "latitude" DECIMAL(9,6),
ADD COLUMN     "longitude" DECIMAL(9,6);

-- AlterTable
ALTER TABLE "delivery_notes" ADD COLUMN     "assigned_employee_id" TEXT,
ADD COLUMN     "assignment_mode" "DeliveryAssignmentMode",
ADD COLUMN     "external_tracking_ref" TEXT;

-- CreateTable
CREATE TABLE "delivery_tracking_events" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "delivery_note_id" TEXT NOT NULL,
    "source" "DeliveryEventSource" NOT NULL DEFAULT 'MANUAL',
    "checkpoint" "DeliveryCheckpoint",
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "location_confirmed" BOOLEAN,
    "notes" TEXT,
    "recorded_by_id" TEXT,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_tracking_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "delivery_tracking_events_tenant_id_delivery_note_id_recorde_idx" ON "delivery_tracking_events"("tenant_id", "delivery_note_id", "recorded_at");

-- AddForeignKey
ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_assigned_employee_id_fkey" FOREIGN KEY ("assigned_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_tracking_events" ADD CONSTRAINT "delivery_tracking_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_tracking_events" ADD CONSTRAINT "delivery_tracking_events_delivery_note_id_fkey" FOREIGN KEY ("delivery_note_id") REFERENCES "delivery_notes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_tracking_events" ADD CONSTRAINT "delivery_tracking_events_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

