-- CreateEnum
CREATE TYPE "SifenEnvironment" AS ENUM ('TESTING', 'PRODUCTION');

-- CreateTable
CREATE TABLE "sifen_configs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "environment" "SifenEnvironment" NOT NULL DEFAULT 'TESTING',
    "cert_filename" TEXT,
    "cert_data" BYTEA,
    "cert_password" TEXT,
    "cert_type" TEXT,
    "cert_valid_from" TIMESTAMP(3),
    "cert_valid_until" TIMESTAMP(3),
    "cert_subject" TEXT,
    "ca_cert_filename" TEXT,
    "ca_cert_data" BYTEA,
    "is_configured" BOOLEAN NOT NULL DEFAULT false,
    "last_tested_at" TIMESTAMP(3),
    "last_test_ok" BOOLEAN,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sifen_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sifen_configs_tenant_id_key" ON "sifen_configs"("tenant_id");

-- AddForeignKey
ALTER TABLE "sifen_configs" ADD CONSTRAINT "sifen_configs_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
