"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth-context";
import { usePermission } from "@/lib/permissions";
import {
  communicationsApi,
  COMMUNICATIONS_PATH,
} from "@/lib/api/communications";
import {
  CommunicationDate,
  CommunicationError,
  DeliveryBadge,
  Pagination,
} from "./shared";

export function EntityTimeline({
  entityType,
  entityId,
  canSendInvoice = false,
  recipient,
}: {
  entityType: "INVOICE";
  entityId: string;
  canSendInvoice?: boolean;
  recipient?: string | null;
}) {
  const { jwtPayload } = useAuth();
  const access = usePermission("communications:access");
  const canRead = usePermission("communications:delivery:read");
  const canReadInvoice =
    (jwtPayload?.permissions.includes("billing:read") ?? false) &&
    (jwtPayload?.activeModules.includes("billing") ?? false);
  return access && canRead && canReadInvoice ? (
    <TimelineContent
      key={`${jwtPayload?.tenantId}:${jwtPayload?.sub}:${entityId}`}
      entityType={entityType}
      entityId={entityId}
      canSendInvoice={canSendInvoice}
      recipient={recipient}
    />
  ) : null;
}

function TimelineContent({
  entityType,
  entityId,
  canSendInvoice,
  recipient,
}: {
  entityType: "INVOICE";
  entityId: string;
  canSendInvoice: boolean;
  recipient?: string | null;
}) {
  const { jwtPayload } = useAuth();
  const tenantId = jwtPayload?.tenantId;
  const userId = jwtPayload?.sub;
  const queryClient = useQueryClient();
  const canNote = usePermission("communications:notes:create");
  const canSend = usePermission("communications:email:send");
  const [page, setPage] = useState(1);
  const [body, setBody] = useState("");
  const settings = useQuery({
    queryKey: ["communications", tenantId, userId, "settings"],
    queryFn: communicationsApi.settings,
  });
  const timeline = useQuery({
    queryKey: ["communication-timeline", tenantId, userId, entityType, entityId, page],
    queryFn: () => communicationsApi.timeline(entityType, entityId, page),
    enabled: settings.data?.enabled === true,
    refetchInterval: 15000,
  });
  const refresh = () => {
    void queryClient.invalidateQueries({
      queryKey: ["communication-timeline", tenantId, userId, entityType, entityId],
    });
    void queryClient.invalidateQueries({
      queryKey: ["communications", tenantId, userId, "messages"],
    });
  };
  const note = useMutation({
    mutationFn: () =>
      communicationsApi.addNote(entityType, entityId, body.trim()),
    onSuccess: () => {
      setBody("");
      setPage(1);
      refresh();
    },
  });
  const send = useMutation({
    mutationFn: () => communicationsApi.sendInvoice(entityId),
    onSuccess: () => {
      setPage(1);
      refresh();
    },
  });
  return (
    <section className="mt-6 space-y-4 rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-semibold">
          <MessageSquare size={17} /> Comunicaciones
        </h2>
        <Link
          href={COMMUNICATIONS_PATH}
          className="text-xs text-muted-foreground underline"
        >
          Abrir centro
        </Link>
      </div>
      {settings.isPending && (
        <p className="text-sm text-muted-foreground">
          Cargando comunicaciones...
        </p>
      )}
      {settings.error && (
        <div className="space-y-3">
          <CommunicationError error={settings.error} />
          <Button variant="outline" onClick={() => void settings.refetch()}>
            Reintentar comunicaciones
          </Button>
        </div>
      )}
      {settings.data && !settings.data.enabled && (
        <p className="text-sm text-muted-foreground">
          El centro de comunicaciones está desactivado para esta empresa.
        </p>
      )}
      {settings.data?.enabled && (
        <>
          {canSend && canSendInvoice && (
            <div className="space-y-2 rounded-xl bg-muted/50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm">
                  Factura y PDF para{" "}
                  <span className="font-medium">
                    {recipient || "cliente sin correo"}
                  </span>
                </p>
                <Button
                  size="sm"
                  disabled={
                    !recipient || !settings.data.emailEnabled || send.isPending
                  }
                  onClick={() => send.mutate()}
                >
                  <Send size={14} />
                  {send.isPending ? "Encolando..." : "Enviar por email"}
                </Button>
              </div>
              {send.isSuccess && (
                <p role="status" className="text-xs text-muted-foreground">
                  Solicitud registrada. Consultá el estado de entrega en el
                  historial.
                </p>
              )}
              {!settings.data.emailEnabled && (
                <p className="text-xs text-muted-foreground">
                  El envío de correos está desactivado.
                </p>
              )}
            </div>
          )}
          {send.error && <CommunicationError error={send.error} />}
          {timeline.isPending && (
            <p className="text-sm text-muted-foreground">
              Cargando historial...
            </p>
          )}
          {timeline.error && (
            <div className="space-y-3">
              <CommunicationError error={timeline.error} />
              <Button variant="outline" size="sm" onClick={() => void timeline.refetch()}>
                Reintentar historial
              </Button>
            </div>
          )}
          {timeline.data?.items.length === 0 && (
            <p className="py-4 text-sm text-muted-foreground">
              Todavía no hay comunicaciones ni notas en esta factura.
            </p>
          )}
          <div className="space-y-3">
            {timeline.data?.items.map((item) => (
              <article
                key={`${item.kind}-${item.id}`}
                className={`rounded-xl border p-3 ${item.kind === "NOTE" ? "border-amber-500/20 bg-amber-500/5" : "border-border"}`}
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>
                    {item.kind === "NOTE" ? "Nota interna" : "Email saliente"}
                  </span>
                  <CommunicationDate value={item.createdAt} />
                </div>
                {item.subject && (
                  <p className="text-sm font-medium">{item.subject}</p>
                )}
                {item.recipient && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Para: {item.recipient}
                  </p>
                )}
                <p className="mt-2 whitespace-pre-wrap break-words text-sm">
                  {item.body ?? item.bodyText}
                </p>
                {item.status && (
                  <div className="mt-2">
                    <DeliveryBadge status={item.status} />
                  </div>
                )}
              </article>
            ))}
          </div>
          {timeline.data && (
            <Pagination
              page={page}
              total={timeline.data.total}
              onChange={setPage}
            />
          )}
          {canNote && (
            <form
              className="space-y-2 border-t border-border pt-4"
              onSubmit={(e) => {
                e.preventDefault();
                note.mutate();
              }}
            >
              <label
                htmlFor={`communication-note-${entityId}`}
                className="text-sm font-medium"
              >
                Agregar nota interna
              </label>
              <Textarea
                id={`communication-note-${entityId}`}
                value={body}
                maxLength={5000}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Contexto para tu equipo. No se envía al cliente."
                rows={3}
              />
              {note.error && <CommunicationError error={note.error} />}
              <Button
                type="submit"
                size="sm"
                variant="outline"
                disabled={!body.trim() || note.isPending}
              >
                {note.isPending ? "Guardando..." : "Guardar nota"}
              </Button>
            </form>
          )}
        </>
      )}
    </section>
  );
}
