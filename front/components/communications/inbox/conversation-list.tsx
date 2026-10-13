"use client";

import { useDeferredValue, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { communicationsApi } from "@/lib/api/communications";
import { conversationPreview, initials } from "@/lib/communications-inbox";
import { CommunicationError, Pagination } from "../shared";
import { communicationKeys, useCommunicationAccess } from "./use-communications";

const SHORT_DATE = new Intl.DateTimeFormat("es-PY", {
  timeZone: "America/Asuncion",
  day: "2-digit",
  month: "2-digit",
});

export function ContactAvatar({ name, problem }: { name: string; problem?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
        problem ? "bg-destructive/10 text-destructive" : "bg-[var(--accent-soft)] text-[var(--accent-text)]",
      )}
    >
      {initials(name)}
    </span>
  );
}

export function ConversationList({
  onlyProblems,
  selectedId,
  onSelect,
}: {
  onlyProblems: boolean;
  selectedId: string | null;
  onSelect: (contactId: string) => void;
}) {
  const { tenantId, userId } = useCommunicationAccess();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const term = useDeferredValue(search.trim());
  const list = useQuery({
    queryKey: [...communicationKeys(tenantId, userId).conversations, { onlyProblems, term, page }],
    queryFn: () => communicationsApi.conversations({ page, onlyProblems, search: term }),
    refetchInterval: 30000,
  });
  const title = onlyProblems ? "Con problemas" : "Clientes";

  return (
    <section
      aria-label={title}
      className="flex min-h-0 min-w-0 flex-1 flex-col rounded-2xl border border-border bg-card"
    >
      <div className="space-y-3 border-b border-border p-3">
        <h2 className="px-1 text-sm font-semibold">{title}</h2>
        <div className="relative">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            aria-label="Buscar conversación"
            placeholder="Buscar por cliente, correo o asunto"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            className="pl-8"
          />
        </div>
      </div>

      {list.isPending && (
        <div className="space-y-2 p-3" aria-busy="true">
          {[1, 2, 3].map((row) => (
            <div key={row} className="h-14 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      )}
      {list.error && (
        <div className="space-y-3 p-3">
          <CommunicationError error={list.error} />
          <Button variant="outline" size="sm" onClick={() => void list.refetch()}>
            Reintentar conversaciones
          </Button>
        </div>
      )}
      {list.data?.items.length === 0 && (
        <p className="p-6 text-center text-sm text-muted-foreground">
          {term
            ? "Ninguna conversación coincide con la búsqueda."
            : onlyProblems
              ? "No hay correos con problemas de envío."
              : "Todavía no hay conversaciones. Empiezan cuando enviás una factura por correo."}
        </p>
      )}

      <ul className="min-h-0 flex-1 overflow-y-auto">
        {list.data?.items.map((conversation) => {
          const { contact } = conversation;
          const selected = selectedId === contact.id;
          return (
            <li key={`${contact.type}:${contact.id}`}>
              <button
                type="button"
                onClick={() => onSelect(contact.id)}
                aria-current={selected ? "true" : undefined}
                className={cn(
                  "flex w-full items-start gap-3 border-b border-border px-3 py-3 text-left transition-colors hover:bg-muted/50",
                  selected && "bg-primary/5",
                )}
              >
                <ContactAvatar name={contact.name} problem={conversation.problems > 0} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium">{contact.name}</span>
                    <time
                      dateTime={conversation.lastAt}
                      className="shrink-0 text-[11px] text-muted-foreground"
                    >
                      {SHORT_DATE.format(new Date(conversation.lastAt))}
                    </time>
                  </span>
                  <span
                    className={cn(
                      "mt-0.5 flex items-center gap-1 text-xs",
                      conversation.problems > 0 ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {conversation.problems > 0 && <AlertTriangle size={12} className="shrink-0" />}
                    <span className="truncate">{conversationPreview(conversation)}</span>
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {list.data && (
        <div className="px-3 pb-3">
          <Pagination page={page} total={list.data.total} onChange={setPage} />
        </div>
      )}
    </section>
  );
}
