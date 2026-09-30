"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiErrorMessage } from "@/lib/api/api-error";
import type { DeliveryStatus } from "@/lib/api/communications";

export const DELIVERY_LABELS: Record<DeliveryStatus, string> = {
  QUEUED: "En cola",
  PROCESSING: "Procesando",
  SENT: "Enviado",
  FAILED: "Fallido",
  UNKNOWN: "Resultado incierto",
};
export function DeliveryBadge({ status }: { status: DeliveryStatus }) {
  return (
    <Badge
      variant={
        status === "FAILED" || status === "UNKNOWN"
          ? "destructive"
          : "secondary"
      }
    >
      {DELIVERY_LABELS[status] ?? status}
    </Badge>
  );
}
export function CommunicationError({ error }: { error: unknown }) {
  return (
    <p
      role="alert"
      className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive"
    >
      {apiErrorMessage(error, "No se pudo completar la operación.")}
    </p>
  );
}
export function CommunicationDate({ value }: { value: string }) {
  return (
    <time dateTime={value}>
      {new Date(value).toLocaleString("es-PY", {
        timeZone: "America/Asuncion",
        dateStyle: "medium",
        timeStyle: "short",
      })}
    </time>
  );
}
export function Pagination({
  page,
  total,
  limit = 20,
  onChange,
}: {
  page: number;
  total: number;
  limit?: number;
  onChange: (page: number) => void;
}) {
  if (total <= limit) return null;
  return (
    <div className="flex items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
      <Button
        size="sm"
        variant="outline"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        Anterior
      </Button>
      <span>
        {page} / {Math.max(1, Math.ceil(total / limit))}
      </span>
      <Button
        size="sm"
        variant="outline"
        disabled={page * limit >= total}
        onClick={() => onChange(page + 1)}
      >
        Siguiente
      </Button>
    </div>
  );
}
