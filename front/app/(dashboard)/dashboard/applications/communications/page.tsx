"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Mail, RefreshCw, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { usePermission } from "@/lib/permissions";
import { useActiveModules } from "@/lib/use-active-modules";
import { cn } from "@/lib/utils";
import {
  communicationsApi,
  type DeliveryStatus,
} from "@/lib/api/communications";
import { CommunicationConfiguration } from "@/components/communications/communication-settings";
import {
  CommunicationDate,
  CommunicationError,
  DeliveryBadge,
  DELIVERY_LABELS,
  Pagination,
} from "@/components/communications/shared";

type View = "deliveries" | "notifications" | "settings";

export default function CommunicationCenterPage() {
  const { jwtPayload } = useAuth();
  const tenantId = jwtPayload?.tenantId;
  const userId = jwtPayload?.sub;
  const access = usePermission("communications:access");
  const { hasModule } = useActiveModules();
  const canRead =
    usePermission("communications:delivery:read") &&
    (jwtPayload?.permissions.includes("billing:read") ?? false) &&
    hasModule("billing");
  const canManage = usePermission("communications:settings:manage");
  const [view, setView] = useState<View>(
    canRead ? "deliveries" : "notifications",
  );
  const [openedMessage, setOpenedMessage] = useState<{
    tenantId: string;
    userId: string;
    id: string;
  } | null>(null);
  const openedMessageId =
    openedMessage &&
    openedMessage.tenantId === tenantId &&
    openedMessage.userId === userId
      ? openedMessage.id
      : null;
  const settings = useQuery({
    queryKey: ["communications", tenantId, userId, "settings"],
    queryFn: communicationsApi.settings,
    enabled: access,
  });
  const tabs = [
    ...(canRead
      ? [{ id: "deliveries" as const, label: "Entregas", icon: Mail }]
      : []),
    { id: "notifications" as const, label: "Notificaciones", icon: Bell },
    ...(canManage
      ? [{ id: "settings" as const, label: "Configuración", icon: Settings }]
      : []),
  ];
  if (!access)
    return (
      <p className="text-sm text-muted-foreground">
        No tenés permiso para acceder al centro de comunicaciones.
      </p>
    );
  return (
    <div className="space-y-6">
      <div>
        <p className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">
          Aplicaciones
        </p>
        <h1 className="text-2xl font-semibold">Centro de comunicaciones</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Correos de documentos, seguimiento de entregas y notificaciones de tu
          empresa.
        </p>
      </div>
      <div className="grid gap-5 xl:grid-cols-[180px_minmax(0,1fr)]">
        <nav
          aria-label="Secciones de comunicaciones"
          className="flex flex-wrap content-start gap-1 xl:flex-col"
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setView(tab.id)}
              aria-current={view === tab.id ? "page" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm",
                view === tab.id
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </nav>
        <div className="min-w-0">
          {settings.isPending && (
            <p className="py-12 text-sm text-muted-foreground">
              Cargando configuración...
            </p>
          )}
          {settings.error && (
            <div className="space-y-3">
              <CommunicationError error={settings.error} />
              <Button variant="outline" onClick={() => void settings.refetch()}>
                Reintentar configuración
              </Button>
            </div>
          )}
          {settings.data &&
            (view === "settings" && canManage ? (
              <CommunicationConfiguration
                key={`${tenantId}:${userId}`}
                settings={settings.data}
              />
            ) : !settings.data.enabled ? (
              <div className="space-y-3 rounded-2xl border border-border bg-card p-8">
                <h2 className="font-semibold">
                  Prepará las comunicaciones de tu empresa
                </h2>
                <p className="text-sm text-muted-foreground">
                  El centro está desactivado. Configurá la identidad remitente,
                  publicá una plantilla y activá el centro para comenzar.
                </p>
                {canManage ? (
                  <Button onClick={() => setView("settings")}>
                    Abrir configuración
                  </Button>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Un administrador puede habilitarlo desde Configuración.
                  </p>
                )}
              </div>
            ) : view === "deliveries" && canRead ? (
              settings.data.emailEnabled ? (
                <Deliveries
                  key={`${tenantId}:${userId}`}
                  openedMessageId={openedMessageId}
                />
              ) : (
                <div className="rounded-2xl border border-border bg-card p-8 text-sm text-muted-foreground">
                  El canal de correo está desactivado para esta empresa. Podés
                  habilitarlo desde Configuración.
                </div>
              )
            ) : (
              <Notifications
                key={`${tenantId}:${userId}`}
                canOpenMessages={canRead && settings.data.emailEnabled}
                emailDisabled={canRead && !settings.data.emailEnabled}
                onOpenMessage={(id) => {
                  if (!tenantId || !userId) return;
                  setOpenedMessage({ tenantId, userId, id });
                  setView("deliveries");
                }}
              />
            ))}
        </div>
      </div>
    </div>
  );
}

function Deliveries({ openedMessageId }: { openedMessageId: string | null }) {
  const { jwtPayload } = useAuth();
  const tenantId = jwtPayload?.tenantId;
  const userId = jwtPayload?.sub;
  const canSend = usePermission("communications:email:send");
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<DeliveryStatus | "">("");
  const [selected, setSelected] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ["communications", tenantId, userId, "messages", page, status],
    queryFn: () => communicationsApi.messages(page, status || undefined),
    refetchInterval: 15000,
  });
  const selectedId = selected ?? openedMessageId ?? list.data?.items[0]?.id;
  const detail = useQuery({
    queryKey: ["communications", tenantId, userId, "messages", "detail", selectedId],
    queryFn: () => communicationsApi.message(selectedId!),
    enabled: !!selectedId,
    refetchInterval: 10000,
  });
  const retry = useMutation({
    mutationFn: (id: string) => communicationsApi.retryMessage(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["communications", tenantId, userId, "messages"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["communication-timeline", tenantId, userId],
      });
    },
  });
  return (
    <div className="grid min-h-[570px] gap-4 2xl:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.3fr)]">
      <section className="flex min-w-0 flex-col rounded-2xl border border-border bg-card">
        <div className="space-y-3 border-b border-border p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Entregas de correo</h2>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Actualizar entregas"
              onClick={() => void list.refetch()}
            >
              <RefreshCw
                size={15}
                className={list.isFetching ? "animate-spin" : ""}
              />
            </Button>
          </div>
          <label className="block text-xs text-muted-foreground">
            Estado
            <select
              value={status}
              className="mt-1 block w-full rounded-xl border border-border bg-background p-2 text-sm text-foreground"
              onChange={(e) => {
                setStatus(e.target.value as DeliveryStatus | "");
                setPage(1);
                setSelected(null);
              }}
            >
              <option value="">Todos los estados</option>
              {Object.entries(DELIVERY_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {list.isPending && (
          <p className="p-5 text-sm text-muted-foreground">
            Cargando entregas...
          </p>
        )}
        {list.error && (
          <div className="p-3">
            <CommunicationError error={list.error} />
          </div>
        )}
        {list.data?.items.length === 0 && (
          <p className="p-5 text-sm text-muted-foreground">
            No hay envíos con este filtro. Podés enviar una factura emitida
            desde su ficha.
          </p>
        )}
        <div className="max-h-[650px] flex-1 overflow-y-auto">
          {list.data?.items.map((message) => (
            <button
              key={message.id}
              onClick={() => {
                setSelected(message.id);
                retry.reset();
              }}
              aria-pressed={selectedId === message.id}
              className={cn(
                "block w-full space-y-2 border-b border-border p-4 text-left hover:bg-muted/50",
                selectedId === message.id && "bg-primary/5",
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <DeliveryBadge status={message.status} />
                <span className="text-[11px] text-muted-foreground">
                  <CommunicationDate value={message.createdAt} />
                </span>
              </div>
              <p className="truncate text-sm font-medium">{message.subject}</p>
              <p className="truncate text-xs text-muted-foreground">
                Para: {message.recipient}
              </p>
            </button>
          ))}
        </div>
        {list.data && (
          <div className="p-3">
            <Pagination
              page={page}
              total={list.data.total}
              onChange={(next) => {
                setPage(next);
                setSelected(null);
              }}
            />
          </div>
        )}
      </section>
      <section className="min-w-0 space-y-5 rounded-2xl border border-border bg-card p-5">
        {!selectedId && (
          <div className="flex h-full min-h-60 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
            <Mail size={30} />
            <p>Seleccioná una entrega para ver su contenido y estado.</p>
          </div>
        )}
        {selectedId && detail.isPending && (
          <p className="text-sm text-muted-foreground">Cargando mensaje...</p>
        )}
        {detail.error && (
          <div className="space-y-3">
            <CommunicationError error={detail.error} />
            <Button variant="outline" size="sm" onClick={() => void detail.refetch()}>
              Reintentar mensaje
            </Button>
          </div>
        )}
        {detail.data && (
          <>
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <DeliveryBadge status={detail.data.status} />
                <span className="text-xs text-muted-foreground">
                  Email saliente
                </span>
              </div>
              <h2 className="break-words text-lg font-semibold">
                {detail.data.subject}
              </h2>
              <dl className="space-y-1 text-xs text-muted-foreground">
                <div>De: {detail.data.fromEmail}</div>
                <div>Para: {detail.data.recipient}</div>
                {detail.data.replyTo && (
                  <div>Responder a: {detail.data.replyTo}</div>
                )}
                <div>
                  Registrado:{" "}
                  <CommunicationDate value={detail.data.createdAt} />
                </div>
              </dl>
            </div>
            <p className="whitespace-pre-wrap break-words rounded-xl bg-muted/40 p-4 text-sm leading-relaxed">
              {detail.data.bodyText}
            </p>
            {detail.data.entityType === "INVOICE" && (
              <Link
                className="inline-block text-sm underline"
                href={`/dashboard/billing/invoices/${encodeURIComponent(detail.data.entityId)}`}
              >
                Abrir factura vinculada
              </Link>
            )}
            {detail.data.status === "SENT" && (
              <p className="text-xs text-muted-foreground">
                El servidor de correo aceptó el mensaje. Este estado no confirma
                la recepción ni la lectura.
              </p>
            )}
            {detail.data.status === "UNKNOWN" && (
              <p className="rounded-xl bg-amber-500/10 p-3 text-sm">
                El proveedor pudo haber aceptado el correo. Verificá su registro
                antes de solicitar otro envío.
              </p>
            )}
            {detail.data.lastError && (
              <p className="text-sm text-destructive">
                {detail.data.lastError}
              </p>
            )}
            {canSend && detail.data.status === "FAILED" && (
              <Button
                variant="outline"
                disabled={retry.isPending}
                onClick={() => retry.mutate(detail.data.id)}
              >
                {retry.isPending ? "Encolando..." : "Reintentar entrega"}
              </Button>
            )}
            {retry.error && <CommunicationError error={retry.error} />}
            <div className="space-y-3 border-t border-border pt-4">
              <h3 className="text-sm font-semibold">Intentos de entrega</h3>
              {detail.data.deliveryAttempts?.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  El mensaje espera procesamiento.
                </p>
              )}
              {detail.data.deliveryAttempts?.map((attempt) => (
                <div
                  key={attempt.id}
                  className="space-y-1 rounded-xl border border-border p-3 text-xs"
                >
                  <p className="font-medium">
                    Intento {attempt.attempt} · {attempt.status}
                  </p>
                  <p className="text-muted-foreground">
                    <CommunicationDate value={attempt.startedAt} />
                  </p>
                  {attempt.errorMessage && (
                    <p className="break-words text-destructive">
                      {attempt.errorMessage}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function Notifications({
  canOpenMessages,
  emailDisabled,
  onOpenMessage,
}: {
  canOpenMessages: boolean;
  emailDisabled: boolean;
  onOpenMessage: (id: string) => void;
}) {
  const { jwtPayload } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const key = [
    "communication-notifications",
    jwtPayload?.tenantId,
    jwtPayload?.sub,
  ];
  const list = useQuery({
    queryKey: [...key, page],
    queryFn: () => communicationsApi.notifications(page),
    refetchInterval: 15000,
  });
  const read = useMutation({
    mutationFn: communicationsApi.readNotification,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });
  return (
    <section className="max-w-4xl space-y-4 rounded-2xl border border-border bg-card p-5">
      <h2 className="font-semibold">
        Mis notificaciones{" "}
        {list.data ? `(${list.data.unreadCount} sin leer)` : ""}
      </h2>
      {list.isPending && (
        <p className="text-sm text-muted-foreground">
          Cargando notificaciones...
        </p>
      )}
      {list.error && (
        <div className="space-y-3">
          <CommunicationError error={list.error} />
          <Button variant="outline" size="sm" onClick={() => void list.refetch()}>
            Reintentar notificaciones
          </Button>
        </div>
      )}
      {read.error && <CommunicationError error={read.error} />}
      {emailDisabled && list.data?.items.some((item) => item.messageId) && (
        <p className="text-sm text-muted-foreground">
          El correo está desactivado. Un administrador puede habilitarlo en
          Configuración para consultar el detalle de las entregas.
        </p>
      )}
      {list.data?.items.length === 0 && (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No tenés notificaciones de comunicaciones.
        </p>
      )}
      {list.data?.items.map((item) => (
        <article
          key={item.id}
          className={cn(
            "flex flex-wrap items-start justify-between gap-3 rounded-xl border p-4",
            item.readAt ? "border-border" : "border-primary/20 bg-primary/5",
          )}
        >
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-medium">{item.title}</h3>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">
              {item.body}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              <CommunicationDate value={item.createdAt} />
            </p>
          </div>
          {canOpenMessages && item.messageId && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onOpenMessage(item.messageId!)}
            >
              Ver entrega
            </Button>
          )}
          {!item.readAt && (
            <Button
              size="sm"
              variant="outline"
              disabled={read.isPending}
              onClick={() => read.mutate(item.id)}
            >
              Marcar leída
            </Button>
          )}
        </article>
      ))}
      {list.data && (
        <Pagination page={page} total={list.data.total} onChange={setPage} />
      )}
    </section>
  );
}
