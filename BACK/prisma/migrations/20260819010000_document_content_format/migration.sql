-- Plantillas de factura/recibo pasan a HTML/CSS crudo (control de layout
-- fino) en vez de TipTap — el contrato de venta sigue en TipTap.

CREATE TYPE "DocContentFormat" AS ENUM ('TIPTAP', 'HTML');

ALTER TABLE "documents" ADD COLUMN "content_format" "DocContentFormat" NOT NULL DEFAULT 'TIPTAP';
