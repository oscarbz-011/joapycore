-- CreateTable
CREATE TABLE "tenant_module_data" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "data_set" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "applied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_module_data_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenant_module_data_tenant_id_data_set_key" ON "tenant_module_data"("tenant_id", "data_set");

-- AddForeignKey
ALTER TABLE "tenant_module_data" ADD CONSTRAINT "tenant_module_data_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
