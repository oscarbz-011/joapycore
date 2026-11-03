-- CreateEnum
CREATE TYPE "RemissionTransitStatus" AS ENUM ('IN_TRANSIT', 'RECEIVED', 'RECEIVED_WITH_DIFFERENCES');

-- AlterEnum
ALTER TYPE "BillingEventType" ADD VALUE 'REMISSION_RECEIVED';

-- AlterEnum
ALTER TYPE "ProductUnitStatus" ADD VALUE 'IN_TRANSIT';

-- AlterTable
ALTER TABLE "remission_note_items" ADD COLUMN     "received_quantity" INTEGER,
ADD COLUMN     "received_serials" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "remission_notes" ADD COLUMN     "received_at" TIMESTAMP(3),
ADD COLUMN     "received_by_id" TEXT,
ADD COLUMN     "reception_notes" TEXT,
ADD COLUMN     "transit_status" "RemissionTransitStatus";

-- CreateIndex
CREATE INDEX "remission_notes_tenant_id_transit_status_idx" ON "remission_notes"("tenant_id", "transit_status");
