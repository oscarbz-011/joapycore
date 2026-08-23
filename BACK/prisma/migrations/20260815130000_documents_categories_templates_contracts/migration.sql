-- CreateEnum
CREATE TYPE "TemplateKind" AS ENUM ('SALE_CONTRACT');

-- CreateTable
CREATE TABLE "document_categories" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "document_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "document_categories_tenant_id_name_key" ON "document_categories"("tenant_id", "name");

-- AddForeignKey
ALTER TABLE "document_categories" ADD CONSTRAINT "document_categories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: un DocumentCategory por cada valor distinto de "category" texto libre ya en uso
INSERT INTO "document_categories" ("id", "tenant_id", "name", "created_at")
SELECT gen_random_uuid(), t."tenant_id", t."category", CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "tenant_id", "category" FROM "documents" WHERE "category" IS NOT NULL AND "category" <> '') t;

-- AlterTable: agregar category_id, backfillear desde category, luego dropear category
ALTER TABLE "documents" ADD COLUMN "category_id" TEXT;

UPDATE "documents" d
SET "category_id" = dc."id"
FROM "document_categories" dc
WHERE dc."tenant_id" = d."tenant_id" AND dc."name" = d."category";

ALTER TABLE "documents" DROP COLUMN "category";

-- AlterTable: reemplazar campos de archivo sueltos por FK 1:1 a file_records
-- (fileUrl/fileName/fileSizeBytes/mimeType no tenían datos reales asociados a un FileRecord existente, se dropean sin backfill)
ALTER TABLE "documents" DROP COLUMN "file_url",
DROP COLUMN "file_name",
DROP COLUMN "file_size_bytes",
DROP COLUMN "mime_type",
ADD COLUMN "file_record_id" TEXT,
ADD COLUMN "is_template" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "template_kind" "TemplateKind",
ADD COLUMN "variables" JSONB;

-- CreateIndex
CREATE UNIQUE INDEX "documents_file_record_id_key" ON "documents"("file_record_id");
CREATE UNIQUE INDEX "documents_tenant_id_template_kind_key" ON "documents"("tenant_id", "template_kind");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "document_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "documents" ADD CONSTRAINT "documents_file_record_id_fkey" FOREIGN KEY ("file_record_id") REFERENCES "file_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: Loan.contractUrl era un placeholder muerto, reemplazado por Document.entityType='sale_order'
ALTER TABLE "loans" DROP COLUMN "contract_url";
