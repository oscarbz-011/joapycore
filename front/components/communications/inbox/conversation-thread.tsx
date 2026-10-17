"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Mail,
  MessageSquare,
  StickyNote,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { usePermission } from "@/lib/permissions";
import { useActiveModules } from "@/lib/use-active-modules";
import {
  communicationsApi,
  type ConversationContact,
  type ThreadMessage,
  type ThreadNote,
} from "@/lib/api/communications";
import { paymentsApi } from "@/lib/api/payments";
import {
  contactBalance,
  deliveryState,
  threadByDay,
  type DeliveryTone,
} from "@/lib/communications-inbox";
import { formatPrice } from "@/components/billing/credit-approval-shared";
import { CommunicationError } from "../shared";
import { ContactAvatar } from "./conversation-list";
import { communicationKeys, useCommunicationAccess } from "./use-communications";

const TIME = new Intl.DateTimeFormat("es-PY", {
  timeZone: "America/Asuncion",
  hour: "2-digit",
  minute: "2-digit",
});

const TONE: Record<DeliveryTone, { icon: React.ElementType; className: string }> = {
  ok: { icon: CheckCircle2, className: "text-emerald-600 dark:text-emerald-400" },
  pending: { icon: Clock, className: "text-muted-foreground" },
  problem: { icon: AlertTriangle, className: "text-destructive" },
};

export function ConversationThread({
  contactId,
  onBack,
}: {
  contactId: string;
  onBack: () => void;
}) {
  const { tenantId, userId, canNote } = useCommunicationAccess();
  const keys = communicationKeys(tenantId, userId);
  const queryClient = useQueryClient();
  const contactRef = { type: "CUSTOMER" as const, id: contactId };
  const [page, setPage] = useState(1);
  const [body, setBody] = useState("");
  const thread = useQuery({
    queryKey: [...keys.thread, contactId, page],
    queryFn: () => communicationsApi.thread(contactRef, page),
    refetchInterval: 15000,
  });
  const note = useMutation({
    mutationFn: () => communicationsApi.addConversationNote(contactRef, body.trim()),
    onSuccess: () => {
      setBody("");
      setPage(1);
      void queryClient.invalidateQueries({ queryKey: keys.thread });
      void queryClient.invalidateQueries({ queryKey: keys.conversations });
    },
  });
  const scroller = useRef<HTMLDivElement>(null);
  const total = thread.data?.total;
  // Lo más nuevo está abajo: al abrir y al sumar algo, se muestra eso.
  useEffect(() => {
    if (page === 1 && scroller.current) {
      scroller.current.scrollTop = scroller.current.scrollHeight;
    }
  }, [total, page]);
  const days = thread.data ? threadByDay(thread.data.items) : [];
  const hasOlder = thread.data ? page * thread.data.limit < thread.data.total : false;

  return (
    <section
      aria-label="Conversación"
      className="flex min-h-0 min-w-0 flex-col rounded-2xl border border-border bg-card"
    >
      <div className="flex items-start gap-3 border-b border-border p-4">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onBack}
          aria-label="Volver a la lista"
          className="lg:hidden"
        >
          <ArrowLeft size={16} />
        </Button>
        {thread.data ? (
          <ContactHeader contact={thread.data.contact} />
        ) : (
          <div className="h-10 flex-1 animate-pulse rounded-xl bg-muted" aria-busy="true" />
        )}
      </div>

      <div ref={scroller} className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        {thread.error && (
          <div className="space-y-3">
            <CommunicationError error={thread.error} />
            <Button variant="outline" size="sm" onClick={() => void thread.refetch()}>
              Reintentar conversación
            </Button>
          </div>
        )}
        {(hasOlder || page > 1) && (
          <div className="flex flex-wrap justify-center gap-2">
            {hasOlder && (
              <Button variant="outline" size="sm" onClick={() => setPage(page + 1)}>
                Ver mensajes anteriores
              </Button>
            )}
            {page > 1 && (
              <Button variant="outline" size="sm" onClick={() => setPage(1)}>
                Volver a los más recientes
              </Button>
            )}
          </div>
        )}
        {thread.data && days.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
            <MessageSquare size={26} />
            <p>Todavía no hay mensajes ni notas con este cliente.</p>
          </div>
        )}
        {days.map((day) => (
          <div key={day.day} className="space-y-3">
            <p className="text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {day.day}
            </p>
            {day.items.map((item) =>
              item.kind === "MESSAGE" ? (
                <EmailCard key={item.id} message={item} />
              ) : (
                <NoteCard key={item.id} note={item} />
              ),
            )}
          </div>
        ))}
      </div>

      {canNote && (
        <form
          className="space-y-2 border-t border-border p-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (body.trim() && !note.isPending) note.mutate();
          }}
        >
          <label htmlFor="conversation-note" className="text-xs font-medium">
            Nota interna
          </label>
          <Textarea
            id="conversation-note"
            value={body}
            maxLength={5000}
            rows={2}
            placeholder="Lo que tu equipo tiene que saber de este cliente"
            onChange={(event) => setBody(event.target.value)}
          />
          {note.error && <CommunicationError error={note.error} />}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Solo la ve tu equipo. No se envía al cliente.
            </p>
            <Button type="submit" size="sm" disabled={!body.trim() || note.isPending}>
              {note.isPending ? "Guardando..." : "Guardar nota"}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}

function ContactHeader({ contact }: { contact: ConversationContact }) {
  const { hasModule } = useActiveModules();
  const canSeeCustomer = usePermission("customers:read") && hasModule("sales");
  const canSeeReceivables = usePermission("payments:read") && hasModule("payments");
  const receivables = useQuery({
    queryKey: ["accounts-receivable"],
    queryFn: paymentsApi.listAR,
    enabled: canSeeReceivables,
  });
  const balance = receivables.data ? contactBalance(receivables.data, contact.id) : null;
  const details = [contact.code, contact.email ?? "Sin correo", contact.phone].filter(Boolean);

  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <ContactAvatar name={contact.name} />
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold">{contact.name}</h2>
          <p className="truncate text-xs text-muted-foreground">
            Cliente · {details.join(" · ")}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {balance && balance.open > 0 && (
          <p className="text-right text-xs">
            <span className="block font-semibold tabular-nums">
              Debe {formatPrice(balance.balance)}
            </span>
            <span className={balance.overdue > 0 ? "text-destructive" : "text-muted-foreground"}>
              {balance.overdue > 0
                ? `${balance.overdue} ${balance.overdue === 1 ? "cuenta vencida" : "cuentas vencidas"}`
                : "Al día"}
            </span>
          </p>
        )}
        {balance?.receivableId && (
          <Link
            href={`/dashboard/payments?ar=${balance.receivableId}`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Ver cuenta
          </Link>
        )}
        {canSeeCustomer && (
          <Link
            href={`/dashboard/sales/customers/${contact.id}`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Ver cliente
          </Link>
        )}
      </div>
    </div>
  );
}

function EmailCard({ message }: { message: ThreadMessage }) {
  const { tenantId, userId, canSend } = useCommunicationAccess();
  const keys = communicationKeys(tenantId, userId);
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [showAttempts, setShowAttempts] = useState(false);
  const state = deliveryState(message.status);
  const tone = TONE[state.tone];
  const attempts = useQuery({
    queryKey: [...keys.message, message.id],
    queryFn: () => communicationsApi.message(message.id),
    enabled: showAttempts,
  });
  const retry = useMutation({
    mutationFn: () => communicationsApi.retryMessage(message.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.base });
    },
  });
  const long = message.bodyText.length > 600 || message.bodyText.split("\n").length > 8;

  return (
    <article
      className={cn(
        "ml-auto max-w-2xl space-y-3 rounded-2xl border p-4",
        state.tone === "problem" ? "border-destructive/30 bg-destructive/5" : "border-border",
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Mail size={13} /> Correo para {message.recipient}
        </span>
        <time dateTime={message.createdAt}>{TIME.format(new Date(message.createdAt))}</time>
      </header>
      <h3 className="break-words text-sm font-semibold">{message.subject}</h3>
      <p
        className={cn(
          "whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90",
          !expanded && long && "line-clamp-6",
        )}
      >
        {message.bodyText}
      </p>
      {long && (
        <button
          type="button"
          className="text-xs font-medium text-[var(--accent-text)] underline-offset-2 hover:underline"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Ver menos" : "Ver completo"}
        </button>
      )}

      <footer className="space-y-2 border-t border-border pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className={cn("flex items-center gap-1.5 text-xs font-medium", tone.className)}>
            <tone.icon size={14} /> {state.label}
          </span>
          <span className="flex flex-wrap items-center gap-3 text-xs">
            {message.entityType === "INVOICE" && (
              <Link
                className="font-medium text-[var(--accent-text)] underline-offset-2 hover:underline"
                href={`/dashboard/billing/invoices/${encodeURIComponent(message.entityId)}`}
              >
                Abrir factura
              </Link>
            )}
            <button
              type="button"
              className="text-muted-foreground underline-offset-2 hover:underline"
              aria-expanded={showAttempts}
              onClick={() => setShowAttempts(!showAttempts)}
            >
              {showAttempts ? "Ocultar detalles" : "Detalles del envío"}
            </button>
          </span>
        </div>
        {state.hint && state.tone === "problem" && (
          <p className="text-xs text-muted-foreground">{state.hint}</p>
        )}
        {message.lastError && state.tone === "problem" && (
          <p className="break-words text-xs text-destructive">{message.lastError}</p>
        )}
        {canSend && message.status === "FAILED" && (
          <Button
            size="sm"
            variant="outline"
            disabled={retry.isPending}
            onClick={() => retry.mutate()}
          >
            {retry.isPending ? "Reintentando..." : "Reintentar envío"}
          </Button>
        )}
        {retry.error && <CommunicationError error={retry.error} />}
        {showAttempts && (
          <div className="space-y-2 rounded-xl bg-muted/40 p-3 text-xs">
            <p className="text-muted-foreground">Enviado desde {message.fromEmail}</p>
            {attempts.isPending && <p className="text-muted-foreground">Cargando intentos...</p>}
            {attempts.error && (
              <div className="space-y-2">
                <CommunicationError error={attempts.error} />
                <Button variant="outline" size="sm" onClick={() => void attempts.refetch()}>
                  Reintentar detalles
                </Button>
              </div>
            )}
            {attempts.data?.deliveryAttempts?.length === 0 && (
              <p className="text-muted-foreground">Todavía no se intentó enviar.</p>
            )}
            {attempts.data?.deliveryAttempts?.map((attempt) => (
              <p key={attempt.id} className="break-words">
                <span className="font-medium">
                  Intento {attempt.attempt} · {TIME.format(new Date(attempt.startedAt))}
                </span>
                {attempt.errorMessage ? ` · ${attempt.errorMessage}` : " · sin errores"}
              </p>
            ))}
          </div>
        )}
      </footer>
    </article>
  );
}

function NoteCard({ note }: { note: ThreadNote }) {
  const author = note.author ? `${note.author.firstName} ${note.author.lastName}` : "Usuario";
  return (
    <article
      className="max-w-2xl space-y-1.5 rounded-2xl border p-4"
      style={{ background: "var(--warn-soft)", borderColor: "color-mix(in srgb, var(--warn) 30%, transparent)" }}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-1.5 font-medium" style={{ color: "var(--warn)" }}>
          <StickyNote size={13} /> Nota interna · {author}
        </span>
        <time dateTime={note.createdAt} className="text-muted-foreground">
          {TIME.format(new Date(note.createdAt))}
        </time>
      </header>
      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{note.body}</p>
    </article>
  );
}
