"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, FileCheck2, Mail, Printer } from "lucide-react";
import { documentsApi } from "../lib/api/documents";
import { filesApi } from "../lib/api/files";
import { downloadBlob, openBlobInNewTab } from "../lib/blob-file";
import { useAuth } from "../lib/auth-context";
import { Button } from "@/components/ui/button";

// Muestra el contrato de compra-venta generado automáticamente para una venta
// a crédito (o cualquier documento tipo CONTRACT vinculado a la entidad). No
// renderiza nada si todavía no existe — la mayoría de las ventas son al contado.
export function ContractCard({
  entityType,
  entityId,
}: {
  entityType: string;
  entityId: string;
}) {
  const { jwtPayload } = useAuth();
  const canManage =
    jwtPayload?.permissions.includes("documents:manage") ?? false;

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["documents", "contract", entityType, entityId],
    queryFn: () =>
      documentsApi.list({ entityType, entityId, type: "CONTRACT" }),
  });

  const contract = docs[0];

  const downloadMutation = useMutation({
    mutationFn: async () => {
      const blob = await filesApi.downloadBlob(contract!.fileRecord!.id);
      downloadBlob(blob, contract!.fileRecord!.originalName);
    },
  });

  const printMutation = useMutation({
    mutationFn: async () => {
      const blob = await filesApi.downloadBlob(contract!.fileRecord!.id);
      openBlobInNewTab(blob);
    },
  });

  const emailMutation = useMutation({
    mutationFn: () => documentsApi.sendEmail(contract!.id),
  });

  if (isLoading) {
    return <div className="h-12 rounded-xl bg-muted/20 animate-pulse" />;
  }

  if (!contract || !contract.fileRecord) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <FileCheck2 size={16} className="text-emerald-600 shrink-0" />
        <p className="text-sm font-medium text-foreground truncate">
          {contract.title}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => downloadMutation.mutate()}
          disabled={downloadMutation.isPending}
        >
          <Download size={14} />
          Descargar
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => printMutation.mutate()}
          disabled={printMutation.isPending}
        >
          <Printer size={14} />
          Imprimir
        </Button>
        {canManage && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => emailMutation.mutate()}
            disabled={emailMutation.isPending}
          >
            <Mail size={14} />
            {emailMutation.isPending
              ? "Enviando..."
              : emailMutation.isSuccess
                ? "Enviado ✓"
                : "Enviar por email"}
          </Button>
        )}
      </div>

      {emailMutation.isError && (
        <p className="text-xs text-destructive">
          {(emailMutation.error as Error)?.message ??
            "No se pudo enviar el email"}
        </p>
      )}
      {emailMutation.data && (
        <p className="text-xs text-emerald-600">
          El servidor SMTP aceptó el mensaje para {emailMutation.data.to}
          {emailMutation.data.messageId
            ? ` · ID ${emailMutation.data.messageId}`
            : ""}
        </p>
      )}
    </div>
  );
}
