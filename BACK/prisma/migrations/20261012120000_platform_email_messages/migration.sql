-- Constancia de lo que sale por el remitente de la plataforma (correos de
-- JoapyCore y de empresas sin correo propio conectado) y base del tope diario.
CREATE TABLE "platform_email_messages" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "purpose" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "from_address" TEXT NOT NULL,
    "reply_to" TEXT,
    "status" TEXT NOT NULL,
    "provider_message_id" TEXT,
    "error_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_email_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "platform_email_messages_tenant_id_created_at_idx" ON "platform_email_messages"("tenant_id", "created_at");

ALTER TABLE "platform_email_messages" ADD CONSTRAINT "platform_email_messages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
