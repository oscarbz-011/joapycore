BEGIN;

-- Enums
DO $$ BEGIN
  CREATE TYPE "CollectionRouteStatus" AS ENUM ('OPEN', 'CLOSED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "VisitResult" AS ENUM ('COLLECTED', 'PARTIAL', 'ABSENT', 'REFUSED', 'PROMISE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "AgreementStatus" AS ENUM ('ACTIVE', 'FULFILLED', 'BROKEN', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CollectionNoteType" AS ENUM ('VISIT', 'CALL', 'MESSAGE', 'GENERAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- collection_routes
CREATE TABLE IF NOT EXISTS "collection_routes" (
  "id"              TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenant_id"       TEXT NOT NULL,
  "route_date"      DATE NOT NULL,
  "collector_id"    TEXT,
  "status"          "CollectionRouteStatus" NOT NULL DEFAULT 'OPEN',
  "total_planned"   DECIMAL(12,2) NOT NULL DEFAULT 0,
  "total_collected" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "notes"           TEXT,
  "closed_at"       TIMESTAMP(3),
  "closed_by_id"    TEXT,
  "created_by_id"   TEXT,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "collection_routes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "collection_routes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "collection_routes_collector_id_fkey" FOREIGN KEY ("collector_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "collection_routes_closed_by_id_fkey" FOREIGN KEY ("closed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "collection_routes_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "collection_routes_tenant_id_route_date_idx"
  ON "collection_routes"("tenant_id", "route_date");
CREATE INDEX IF NOT EXISTS "collection_routes_tenant_id_collector_id_idx"
  ON "collection_routes"("tenant_id", "collector_id");

-- collection_visits
CREATE TABLE IF NOT EXISTS "collection_visits" (
  "id"               TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenant_id"        TEXT NOT NULL,
  "route_id"         TEXT NOT NULL,
  "customer_id"      TEXT NOT NULL,
  "loan_id"          TEXT,
  "installment_id"   TEXT,
  "ar_id"            TEXT,
  "planned_amount"   DECIMAL(12,2) NOT NULL,
  "collected_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "result"           "VisitResult",
  "promise_date"     TIMESTAMP(3),
  "payment_method"   "PaymentMethod",
  "reference"        TEXT,
  "notes"            TEXT,
  "visited_at"       TIMESTAMP(3),
  "visit_order"      INTEGER NOT NULL DEFAULT 0,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "collection_visits_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "collection_visits_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "collection_visits_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "collection_routes"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "collection_visits_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "collection_visits_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "collection_visits_installment_id_fkey" FOREIGN KEY ("installment_id") REFERENCES "installments"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "collection_visits_ar_id_fkey" FOREIGN KEY ("ar_id") REFERENCES "accounts_receivable"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "collection_visits_tenant_id_route_id_idx"
  ON "collection_visits"("tenant_id", "route_id");
CREATE INDEX IF NOT EXISTS "collection_visits_tenant_id_customer_id_idx"
  ON "collection_visits"("tenant_id", "customer_id");

-- payment_agreements
CREATE TABLE IF NOT EXISTS "payment_agreements" (
  "id"                  TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenant_id"           TEXT NOT NULL,
  "customer_id"         TEXT NOT NULL,
  "loan_id"             TEXT,
  "original_debt"       DECIMAL(12,2) NOT NULL,
  "agreed_installments" INTEGER NOT NULL,
  "agreed_amount"       DECIMAL(12,2) NOT NULL,
  "start_date"          DATE NOT NULL,
  "status"              "AgreementStatus" NOT NULL DEFAULT 'ACTIVE',
  "notes"               TEXT,
  "approved_by_id"      TEXT,
  "created_by_id"       TEXT,
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_agreements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_agreements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payment_agreements_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payment_agreements_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "payment_agreements_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "payment_agreements_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "payment_agreements_tenant_id_customer_id_idx"
  ON "payment_agreements"("tenant_id", "customer_id");

-- collection_notes
CREATE TABLE IF NOT EXISTS "collection_notes" (
  "id"            TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenant_id"     TEXT NOT NULL,
  "customer_id"   TEXT NOT NULL,
  "note"          TEXT NOT NULL,
  "type"          "CollectionNoteType" NOT NULL DEFAULT 'GENERAL',
  "created_by_id" TEXT,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "collection_notes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "collection_notes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "collection_notes_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "collection_notes_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "collection_notes_tenant_id_customer_id_idx"
  ON "collection_notes"("tenant_id", "customer_id");

COMMIT;
