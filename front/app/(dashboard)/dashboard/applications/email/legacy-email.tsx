"use client";

// Implementación anterior conservada durante la migración; no tiene ruta pública.

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  FileText,
  Forward,
  Inbox,
  Mail,
  MailCheck,
  PenLine,
  Plus,
  RefreshCw,
  Reply,
  Search,
  Send,
  Settings,
  Star,
  Trash2,
  X,
} from "lucide-react";
import {
  applicationsApi,
  type AppEmailMessage,
  type AppIncomingEmailMessage,
} from "@/lib/api/applications";
import { apiErrorMessage } from "@/lib/api/api-error";
import { synchronizeInboxPreservingCache } from "@/lib/application-email-inbox";
import { useAuth } from "@/lib/auth-context";
import { usePermission } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type MailFolder = "inbox" | "starred" | "sent" | "drafts" | "trash";

interface ComposeValues {
  to: string;
  subject: string;
  body: string;
}

interface MailboxMessage {
  id: string;
  direction: "incoming" | "outgoing";
  name: string;
  address: string;
  recipients: string;
  subject: string;
  bodyText: string;
  date: string;
  status?: AppEmailMessage["status"];
  starred: boolean;
}

const EMPTY_COMPOSE: ComposeValues = { to: "", subject: "", body: "" };
const INBOX_QUERY_KEY = ["application-email-inbox"] as const;

function initials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return (
    parts.length > 1
      ? `${parts[0][0]}${parts.at(-1)?.[0] ?? ""}`
      : value.slice(0, 2)
  ).toUpperCase();
}

function messageDate(value: string | null) {
  if (!value) return "Pendiente";
  const date = new Date(value);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return sameDay
    ? date.toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString("es-PY", { day: "2-digit", month: "short" });
}

function fullMessageDate(value: string | null) {
  if (!value) return "Envío pendiente";
  return new Date(value).toLocaleString("es-PY", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function statusLabel(status: AppEmailMessage["status"]) {
  if (status === "SENT") return "Enviado";
  if (status === "FAILED") return "No enviado";
  return "Enviando";
}

function ComposeDialog({
  open,
  onOpenChange,
  initialValues,
  senderEmail,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialValues: ComposeValues;
  senderEmail: string;
}) {
  const queryClient = useQueryClient();
  const [to, setTo] = useState(initialValues.to);
  const [subject, setSubject] = useState(initialValues.subject);
  const [body, setBody] = useState(initialValues.body);
  const [error, setError] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      applicationsApi.sendEmail({
        to: to.trim(),
        subject: subject.trim(),
        body,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["application-email-messages"],
      });
      onOpenChange(false);
    },
    onError: (err: Error) =>
      setError(apiErrorMessage(err, "No se pudo enviar el correo")),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="gap-0 overflow-hidden p-0 sm:max-w-2xl"
      >
        <div className="flex items-center justify-between border-b border-border bg-muted/30 px-5 py-3.5">
          <div>
            <DialogTitle>Nuevo mensaje</DialogTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Se enviará desde la cuenta asignada por tu empresa
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onOpenChange(false)}
            aria-label="Cerrar redacción"
          >
            <X size={17} />
          </Button>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            setError("");
            mutation.mutate();
          }}
        >
          <div className="divide-y divide-border px-5">
            <div className="flex min-h-12 items-center gap-3">
              <span className="w-14 shrink-0 text-xs font-medium text-muted-foreground">
                De
              </span>
              <span className="truncate text-sm text-foreground">
                {senderEmail || "Cuenta de correo del usuario"}
              </span>
            </div>
            <div className="flex min-h-12 items-center gap-3">
              <Label htmlFor="mail-to" className="w-14 shrink-0 text-xs">
                Para
              </Label>
              <Input
                id="mail-to"
                type="email"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                required
                autoFocus
                placeholder="nombre@empresa.com"
                className="h-10 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
              />
            </div>
            <div className="flex min-h-12 items-center gap-3">
              <Label htmlFor="mail-subject" className="w-14 shrink-0 text-xs">
                Asunto
              </Label>
              <Input
                id="mail-subject"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                required
                maxLength={255}
                placeholder="Escribí un asunto"
                className="h-10 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
              />
            </div>
          </div>

          <div className="px-5 py-4">
            <Textarea
              aria-label="Mensaje"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              required
              rows={14}
              placeholder="Escribí tu mensaje..."
              className="min-h-72 resize-none border-0 bg-transparent px-0 text-sm leading-6 shadow-none focus-visible:ring-0"
            />
            {error && (
              <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-border bg-muted/20 px-5 py-3.5">
            <p className="text-xs text-muted-foreground">
              {body.length.toLocaleString("es-PY")} / 100.000 caracteres
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                <Send size={15} />
                {mutation.isPending ? "Enviando..." : "Enviar correo"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function StatusIcon({ status }: { status: AppEmailMessage["status"] }) {
  if (status === "SENT") {
    return <CheckCircle2 size={14} className="text-emerald-500" />;
  }
  if (status === "FAILED") {
    return <AlertCircle size={14} className="text-destructive" />;
  }
  return <Clock3 size={14} className="text-amber-500" />;
}

function MessageListItem({
  message,
  selected,
  onSelect,
}: {
  message: MailboxMessage;
  selected: boolean;
  onSelect: () => void;
}) {
  const sender = message.name || message.address;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group w-full border-b border-border px-4 py-4 text-left transition-colors",
        selected ? "bg-primary/8" : "hover:bg-muted/45",
      )}
    >
      <div className="flex gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
          {initials(sender)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate text-sm font-semibold text-foreground">
              {sender}
            </p>
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {messageDate(message.date)}
            </span>
          </div>
          <p className="mt-1 truncate text-sm font-medium text-foreground/80">
            {message.subject}
          </p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
            {message.bodyText}
          </p>
          {message.status && (
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <StatusIcon status={message.status} />
              {statusLabel(message.status)}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

function EmptyMailbox({
  folder,
  canManage,
  incomingReady,
}: {
  folder: MailFolder;
  canManage: boolean;
  incomingReady: boolean;
}) {
  if (folder === "inbox") {
    return (
      <div className="flex h-full min-h-80 flex-col items-center justify-center px-7 text-center">
        <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10">
          <Inbox className="text-primary" size={25} />
        </div>
        <h3 className="text-sm font-semibold">
          {incomingReady
            ? "Todavía no hay mensajes sincronizados"
            : "La recepción aún no está activa"}
        </h3>
        <p className="mt-2 max-w-xs text-xs leading-5 text-muted-foreground">
          {incomingReady
            ? "No se encontraron mensajes en la bandeja de entrada. Usá Actualizar para volver a consultar el servidor."
            : "Para recibir mensajes, un administrador debe configurar el servidor de entrada y asignarte un buzón del dominio de la empresa."}
        </p>
        {canManage && !incomingReady && (
          <Link href="/dashboard/settings?tab=integrations" className="mt-5">
            <Button variant="outline" size="sm">
              <Settings size={14} />
              Configurar correo
            </Button>
          </Link>
        )}
      </div>
    );
  }

  const copy: Record<Exclude<MailFolder, "inbox">, [string, string]> = {
    starred: [
      "No hay correos destacados",
      "Los mensajes que marques como importantes aparecerán aquí.",
    ],
    sent: [
      "Todavía no enviaste correos",
      "Cuando envíes un mensaje, podrás consultarlo desde esta bandeja.",
    ],
    drafts: [
      "No hay borradores",
      "Los mensajes que guardes para continuar más tarde aparecerán aquí.",
    ],
    trash: [
      "La papelera está vacía",
      "Los mensajes eliminados aparecerán temporalmente aquí.",
    ],
  };
  const [title, description] = copy[folder];

  return (
    <div className="flex h-full min-h-80 flex-col items-center justify-center px-7 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-muted">
        <Mail className="text-muted-foreground" size={21} />
      </div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-2 max-w-xs text-xs leading-5 text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

export default function ApplicationEmailPage() {
  const queryClient = useQueryClient();
  const { user, jwtPayload } = useAuth();
  const canSend = usePermission("applications:email:send");
  const canManageIntegrations = usePermission("integrations:manage");
  const [folder, setFolder] = useState<MailFolder>("inbox");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeKey, setComposeKey] = useState(0);
  const [composeValues, setComposeValues] =
    useState<ComposeValues>(EMPTY_COMPOSE);

  const { data: emailStatus, isLoading: statusLoading } = useQuery({
    queryKey: ["application-email-status"],
    queryFn: applicationsApi.getEmailStatus,
  });
  const outgoingReady =
    emailStatus?.outgoingEnabled ?? emailStatus?.enabled ?? false;
  const incomingReady = emailStatus?.incomingEnabled ?? false;
  const {
    data: messages = [],
    isLoading: messagesLoading,
    isFetching,
  } = useQuery({
    queryKey: ["application-email-messages"],
    queryFn: applicationsApi.listEmailMessages,
  });
  const {
    data: inboxMessages = [],
    isLoading: inboxLoading,
    isFetching: inboxFetching,
    error: inboxError,
  } = useQuery({
    queryKey: INBOX_QUERY_KEY,
    queryFn: applicationsApi.listEmailInbox,
    enabled: incomingReady,
    retry: false,
  });
  const {
    data: inboxSyncResult,
    isPending: inboxSyncing,
    mutate: synchronizeInbox,
  } = useMutation({
    mutationFn: () =>
      synchronizeInboxPreservingCache({
        sync: applicationsApi.syncEmailInbox,
        load: applicationsApi.listEmailInbox,
        replaceCached: (nextMessages: AppIncomingEmailMessage[]) => {
          queryClient.setQueryData(INBOX_QUERY_KEY, nextMessages);
        },
      }),
  });
  const inboxSyncError =
    inboxSyncResult?.ok === false ? inboxSyncResult.error : null;

  useEffect(() => {
    if (incomingReady) synchronizeInbox();
  }, [incomingReady, synchronizeInbox]);

  const mailboxAddress =
    emailStatus?.mailboxAddress ?? user?.email ?? jwtPayload?.email ?? "";

  const filteredMessages = useMemo(() => {
    let source: MailboxMessage[] = [];
    if (folder === "sent") {
      source = messages.map((message) => ({
        id: message.id,
        direction: "outgoing" as const,
        name: `${message.sentBy.firstName} ${message.sentBy.lastName}`,
        address: message.recipient,
        recipients: message.recipient,
        subject: message.subject,
        bodyText: message.bodyText,
        date: message.sentAt ?? message.createdAt,
        status: message.status,
        starred: false,
      }));
    } else if (folder === "inbox" || folder === "starred") {
      source = inboxMessages
        .filter((message) => folder !== "starred" || message.starred)
        .map((message) => ({
          id: message.id,
          direction: "incoming" as const,
          name: message.senderName || message.senderEmail,
          address: message.senderEmail,
          recipients: message.recipients,
          subject: message.subject,
          bodyText: message.bodyText,
          date: message.receivedAt,
          starred: message.starred,
        }));
    }
    const normalized = query.trim().toLocaleLowerCase("es");
    if (!normalized) return source;
    return source.filter((message) => {
      return [
        message.name,
        message.address,
        message.subject,
        message.bodyText,
      ].some((value) => value.toLocaleLowerCase("es").includes(normalized));
    });
  }, [folder, inboxMessages, messages, query]);

  const selectedMessage =
    filteredMessages.find((message) => message.id === selectedId) ??
    filteredMessages[0] ??
    null;

  function openComposer(values: ComposeValues = EMPTY_COMPOSE) {
    setComposeValues(values);
    setComposeKey((current) => current + 1);
    setComposeOpen(true);
  }

  function selectFolder(nextFolder: MailFolder) {
    setFolder(nextFolder);
    setSelectedId(null);
    setQuery("");
  }

  const folders: Array<{
    id: MailFolder;
    label: string;
    icon: typeof Inbox;
    count?: number;
  }> = [
    {
      id: "inbox",
      label: "Recibidos",
      icon: Inbox,
      count: inboxMessages.length,
    },
    {
      id: "starred",
      label: "Destacados",
      icon: Star,
      count: inboxMessages.filter((message) => message.starred).length,
    },
    { id: "sent", label: "Enviados", icon: Send, count: messages.length },
    { id: "drafts", label: "Borradores", icon: FileText },
    { id: "trash", label: "Papelera", icon: Trash2 },
  ];

  const folderName =
    folders.find((item) => item.id === folder)?.label ?? "Correo";
  const isLoading =
    statusLoading ||
    (folder === "sent"
      ? messagesLoading
      : folder === "inbox"
        ? inboxLoading
        : false);
  const folderFetching =
    folder === "inbox" ? inboxFetching || inboxSyncing : isFetching;

  return (
    <div className="flex h-[calc(100vh-7.4rem)] min-h-[620px] flex-col">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold text-foreground">Correo</h1>
            {!incomingReady && outgoingReady && (
              <Badge variant="outline" className="text-[11px] font-medium">
                Solo salida
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Tu espacio de correo de {jwtPayload?.tenantName ?? "la empresa"}.
          </p>
        </div>
        {canSend && (
          <Button onClick={() => openComposer()} disabled={!outgoingReady}>
            <PenLine size={15} />
            Redactar
          </Button>
        )}
      </div>

      {!outgoingReady && !statusLoading && (
        <div className="mb-4 flex items-center justify-between gap-4 rounded-xl border border-amber-500/25 bg-amber-500/8 px-4 py-3">
          <div className="flex items-center gap-3">
            <AlertCircle size={18} className="shrink-0 text-amber-500" />
            <div>
              <p className="text-sm font-medium">
                El envío de correo no está disponible
              </p>
              <p className="text-xs text-muted-foreground">
                El administrador de la empresa debe conectar el servidor de
                correo.
              </p>
            </div>
          </div>
          {canManageIntegrations && (
            <Link href="/dashboard/settings?tab=integrations">
              <Button variant="outline" size="sm">
                <Settings size={14} />
                Configurar
              </Button>
            </Link>
          )}
        </div>
      )}

      <section className="grid min-h-0 flex-1 grid-cols-[190px_340px_minmax(0,1fr)] overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <aside className="flex min-h-0 flex-col border-r border-border bg-muted/15 p-3">
          {canSend && (
            <Button
              className="mb-4 w-full justify-center"
              onClick={() => openComposer()}
              disabled={!outgoingReady}
            >
              <Plus size={16} />
              Nuevo correo
            </Button>
          )}

          <nav className="space-y-1" aria-label="Buzones de correo">
            {folders.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectFolder(item.id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                    folder === item.id
                      ? "bg-primary/10 font-medium text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon size={16} />
                  <span className="flex-1 text-left">{item.label}</span>
                  {item.count !== undefined && item.count > 0 && (
                    <span className="text-[11px] tabular-nums">
                      {item.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          <div className="mt-auto border-t border-border pt-4">
            <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Cuenta asignada
            </p>
            <div className="flex items-center gap-2.5 rounded-xl bg-background/60 p-2.5">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/12 text-[11px] font-semibold text-primary">
                {initials(`${user?.firstName ?? ""} ${user?.lastName ?? ""}`)}
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-medium">
                  {user?.firstName} {user?.lastName}
                </p>
                <p className="truncate text-[10px] text-muted-foreground">
                  {mailboxAddress || "Sin correo asignado"}
                </p>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2 px-2 text-[10px] text-muted-foreground">
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  outgoingReady ? "bg-emerald-500" : "bg-amber-500",
                )}
              />
              {outgoingReady ? "Salida conectada" : "Correo sin conectar"}
            </div>
          </div>
        </aside>

        <div className="flex min-h-0 flex-col border-r border-border">
          <div className="border-b border-border px-4 py-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">{folderName}</h2>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {folder === "sent" || folder === "inbox"
                    ? `${filteredMessages.length} mensaje${filteredMessages.length === 1 ? "" : "s"}`
                    : "Buzón personal"}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => {
                  void queryClient.invalidateQueries({
                    queryKey: ["application-email-messages"],
                  });
                  void queryClient.invalidateQueries({
                    queryKey: ["application-email-status"],
                  });
                  if (folder === "inbox") {
                    synchronizeInbox();
                  }
                }}
                disabled={folderFetching}
                aria-label="Actualizar mensajes"
                title="Actualizar"
              >
                <RefreshCw
                  size={15}
                  className={cn(folderFetching && "animate-spin")}
                />
              </Button>
            </div>
            <div className="relative">
              <Search
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar correo..."
                className="h-9 bg-muted/40 pl-9 text-xs"
              />
            </div>
            {inboxSyncError !== null && folder === "inbox" && (
              <p className="mt-2 text-[11px] text-amber-600">
                No se pudo actualizar el servidor IMAP. Se muestran los
                mensajes guardados.
              </p>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="space-y-0">
                {[1, 2, 3, 4].map((item) => (
                  <div key={item} className="border-b border-border p-4">
                    <div className="flex animate-pulse gap-3">
                      <div className="size-9 rounded-full bg-muted" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 w-2/3 rounded bg-muted" />
                        <div className="h-3 w-4/5 rounded bg-muted" />
                        <div className="h-3 w-full rounded bg-muted" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : inboxError && folder === "inbox" ? (
              <div className="flex h-full min-h-72 flex-col items-center justify-center px-6 text-center">
                <AlertCircle size={25} className="mb-3 text-destructive" />
                <p className="text-sm font-medium">No se pudo cargar el buzón</p>
                <p className="mt-2 max-w-xs text-xs leading-5 text-muted-foreground">
                  {apiErrorMessage(
                    inboxError,
                    "Revisá la configuración IMAP y volvé a intentar.",
                  )}
                </p>
              </div>
            ) : filteredMessages.length === 0 ? (
              query && (folder === "sent" || folder === "inbox") ? (
                <div className="flex h-full min-h-72 flex-col items-center justify-center px-6 text-center">
                  <Search size={24} className="mb-3 text-muted-foreground/50" />
                  <p className="text-sm font-medium">Sin resultados</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Probá con otro destinatario, asunto o contenido.
                  </p>
                </div>
              ) : (
                <EmptyMailbox
                  folder={folder}
                  canManage={canManageIntegrations}
                  incomingReady={incomingReady}
                />
              )
            ) : (
              filteredMessages.map((message) => (
                <MessageListItem
                  key={message.id}
                  message={message}
                  selected={message.id === selectedMessage?.id}
                  onSelect={() => setSelectedId(message.id)}
                />
              ))
            )}
          </div>
        </div>

        <div className="min-h-0 overflow-y-auto bg-background/30">
          {selectedMessage ? (
            <article className="animate-fade-in min-h-full">
              <header className="border-b border-border px-6 py-5">
                <div className="mb-5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <MailCheck size={15} className="text-primary" />
                    {selectedMessage.direction === "incoming"
                      ? "Recibidos"
                      : "Enviados"}
                  </div>
                  {selectedMessage.status && (
                    <Badge
                      variant={
                        selectedMessage.status === "FAILED"
                          ? "destructive"
                          : "outline"
                      }
                      className="gap-1.5"
                    >
                      <StatusIcon status={selectedMessage.status} />
                      {statusLabel(selectedMessage.status)}
                    </Badge>
                  )}
                </div>

                <h2 className="text-xl font-semibold leading-7 text-foreground">
                  {selectedMessage.subject}
                </h2>

                <div className="mt-5 flex items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {initials(selectedMessage.name || selectedMessage.address)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold">
                        {selectedMessage.name}
                      </p>
                      <time className="text-xs text-muted-foreground">
                        {fullMessageDate(selectedMessage.date)}
                      </time>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {selectedMessage.direction === "incoming"
                        ? `De: ${selectedMessage.address} · Para: ${selectedMessage.recipients}`
                        : `Para: ${selectedMessage.address}`}
                    </p>
                  </div>
                </div>
              </header>

              <div className="px-6 py-7">
                <div className="whitespace-pre-wrap text-sm leading-7 text-foreground/90">
                  {selectedMessage.bodyText}
                </div>
              </div>

              {canSend && outgoingReady && (
                <footer className="mx-6 mt-4 flex flex-wrap gap-2 border-t border-border py-5">
                  <Button
                    variant="outline"
                    onClick={() =>
                      openComposer({
                        to: selectedMessage.address,
                        subject: selectedMessage.subject.startsWith("Re:")
                          ? selectedMessage.subject
                          : `Re: ${selectedMessage.subject}`,
                        body: "",
                      })
                    }
                  >
                    <Reply size={15} />
                    {selectedMessage.direction === "incoming"
                      ? "Responder"
                      : "Escribir nuevamente"}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      openComposer({
                        to: "",
                        subject: selectedMessage.subject.startsWith("Fwd:")
                          ? selectedMessage.subject
                          : `Fwd: ${selectedMessage.subject}`,
                        body: `\n\n---------- Mensaje reenviado ----------\n${selectedMessage.direction === "incoming" ? "De" : "Para"}: ${selectedMessage.address}\nFecha: ${fullMessageDate(selectedMessage.date)}\nAsunto: ${selectedMessage.subject}\n\n${selectedMessage.bodyText}`,
                      })
                    }
                  >
                    <Forward size={15} />
                    Reenviar
                  </Button>
                </footer>
              )}
            </article>
          ) : (
            <div className="flex h-full min-h-96 flex-col items-center justify-center px-8 text-center">
              <div className="mb-4 flex size-16 items-center justify-center rounded-3xl bg-muted/70">
                <Mail size={27} className="text-muted-foreground/60" />
              </div>
              <h3 className="text-sm font-semibold">Seleccioná un correo</h3>
              <p className="mt-2 max-w-sm text-xs leading-5 text-muted-foreground">
                Elegí un mensaje de la lista para leerlo. Tu buzón se mantendrá
                separado de las configuraciones administrativas de la empresa.
              </p>
            </div>
          )}
        </div>
      </section>

      <ComposeDialog
        key={composeKey}
        open={composeOpen}
        onOpenChange={setComposeOpen}
        initialValues={composeValues}
        senderEmail={mailboxAddress}
      />
    </div>
  );
}
