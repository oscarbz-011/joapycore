CREATE TABLE "calendar_events" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "all_day" BOOLEAN NOT NULL DEFAULT false,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "company_wide" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "calendar_events_tenant_id_starts_at_idx" ON "calendar_events"("tenant_id", "starts_at");
CREATE INDEX "calendar_events_tenant_id_created_by_starts_at_idx" ON "calendar_events"("tenant_id", "created_by", "starts_at");
