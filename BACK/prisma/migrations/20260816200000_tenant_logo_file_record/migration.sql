-- AlterTable
ALTER TABLE "tenants" DROP COLUMN "logo_url",
ADD COLUMN     "logo_file_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "tenants_logo_file_id_key" ON "tenants"("logo_file_id");

-- AddForeignKey
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_logo_file_id_fkey" FOREIGN KEY ("logo_file_id") REFERENCES "file_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
