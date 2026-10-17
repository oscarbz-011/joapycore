"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, MessageSquarePlus, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { apiErrorMessage } from "@/lib/api/api-error";
import { chatApi, type ChatConversation } from "@/lib/api/chat";
import {
  conversationPreview,
  conversationTitle,
  initials,
  listTime,
  matchesSearch,
  personName,
} from "@/lib/chat";
import { chatKeys, useChatIdentity } from "./use-chat";

export function ChatAvatar({ name, group }: { name: string; group?: boolean }) {
  return (
    <span
      aria-hidden
      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-xs font-semibold text-[var(--accent-text)]"
    >
      {group ? <Users size={16} /> : initials(name)}
    </span>
  );
}

function ErrorNote({ error, onRetry, label }: { error: unknown; onRetry: () => void; label: string }) {
  return (
    <div className="space-y-3 p-3">
      <p
        role="alert"
        className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive"
      >
        {apiErrorMessage(error, "No se pudo completar la operación.")}
      </p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        {label}
      </Button>
    </div>
  );
}

export function ChatList({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (conversationId: string) => void;
}) {
  const { tenantId, userId } = useChatIdentity();
  const [search, setSearch] = useState("");
  const [starting, setStarting] = useState(false);
  const list = useQuery({
    queryKey: chatKeys(tenantId, userId).conversations,
    queryFn: chatApi.conversations,
    refetchInterval: 30000,
  });
  const shown = (list.data ?? []).filter((conversation) =>
    matchesSearch(conversationTitle(conversation, userId), search),
  );

  if (starting) {
    return (
      <NewChat
        onCancel={() => setStarting(false)}
        onOpened={(conversation) => {
          setStarting(false);
          onSelect(conversation.id);
        }}
      />
    );
  }

  return (
    <section
      aria-label="Conversaciones"
      className="flex min-h-0 min-w-0 flex-1 flex-col rounded-2xl border border-border bg-card"
    >
      <div className="space-y-3 border-b border-border p-3">
        <div className="flex items-center justify-between gap-2 px-1">
          <h2 className="text-sm font-semibold">Conversaciones</h2>
          <Button size="sm" onClick={() => setStarting(true)}>
            <MessageSquarePlus size={14} /> Nuevo chat
          </Button>
        </div>
        <div className="relative">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            aria-label="Buscar conversación"
            placeholder="Buscar por nombre"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
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
        <ErrorNote
          error={list.error}
          label="Reintentar conversaciones"
          onRetry={() => void list.refetch()}
        />
      )}
      {list.data && shown.length === 0 && (
        <p className="p-6 text-center text-sm text-muted-foreground">
          {list.data.length === 0
            ? "Todavía no hablaste con nadie. Empezá un chat con un compañero."
            : "Ninguna conversación coincide con la búsqueda."}
        </p>
      )}

      <ul className="min-h-0 flex-1 overflow-y-auto">
        {shown.map((conversation) => (
          <ConversationRow
            key={conversation.id}
            conversation={conversation}
            meId={userId}
            selected={selectedId === conversation.id}
            onSelect={() => onSelect(conversation.id)}
          />
        ))}
      </ul>
    </section>
  );
}

function ConversationRow({
  conversation,
  meId,
  selected,
  onSelect,
}: {
  conversation: ChatConversation;
  meId: string | undefined;
  selected: boolean;
  onSelect: () => void;
}) {
  const title = conversationTitle(conversation, meId);
  const unread = conversation.unread > 0;
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? "true" : undefined}
        className={cn(
          "flex w-full items-start gap-3 border-b border-border px-3 py-3 text-left transition-colors hover:bg-muted/50",
          selected && "bg-primary/5",
        )}
      >
        <ChatAvatar name={title} group={conversation.kind === "GROUP"} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className={cn("truncate text-sm", unread ? "font-semibold" : "font-medium")}>
              {title}
            </span>
            {conversation.lastMessage && (
              <time
                dateTime={conversation.lastMessage.createdAt}
                className="shrink-0 text-[11px] text-muted-foreground"
              >
                {listTime(conversation.lastMessage.createdAt)}
              </time>
            )}
          </span>
          <span className="mt-0.5 flex items-center justify-between gap-2">
            <span
              className={cn(
                "truncate text-xs",
                unread ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {conversationPreview(conversation, meId)}
            </span>
            {unread && (
              <span
                aria-label={`${conversation.unread} sin leer`}
                className="shrink-0 rounded-full bg-primary px-1.5 py-px text-[11px] font-bold leading-none text-primary-foreground"
              >
                {conversation.unread}
              </span>
            )}
          </span>
        </span>
      </button>
    </li>
  );
}

function NewChat({
  onCancel,
  onOpened,
}: {
  onCancel: () => void;
  onOpened: (conversation: ChatConversation) => void;
}) {
  const { tenantId, userId } = useChatIdentity();
  const keys = chatKeys(tenantId, userId);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [name, setName] = useState("");
  const people = useQuery({ queryKey: keys.people, queryFn: chatApi.people });
  const open = useMutation({
    mutationFn: (input: { ids: string[]; name?: string }) => chatApi.open(input.ids, input.name),
    onSuccess: (conversation) => {
      void queryClient.invalidateQueries({ queryKey: keys.conversations });
      onOpened(conversation);
    },
  });
  const shown = (people.data ?? []).filter((person) => matchesSearch(personName(person), search));
  const toggle = (id: string) =>
    setPicked((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );

  return (
    <section
      aria-label="Nuevo chat"
      className="flex min-h-0 min-w-0 flex-1 flex-col rounded-2xl border border-border bg-card"
    >
      <div className="space-y-3 border-b border-border p-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon-sm" aria-label="Volver a las conversaciones" onClick={onCancel}>
            <ArrowLeft size={16} />
          </Button>
          <h2 className="text-sm font-semibold">Nuevo chat</h2>
        </div>
        <div className="relative">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            aria-label="Buscar persona"
            placeholder="Buscar a un compañero"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-8"
          />
        </div>
        <label className="flex items-center gap-2 px-1 text-sm">
          <Checkbox
            checked={group}
            onCheckedChange={(checked) => {
              setGroup(checked === true);
              setPicked([]);
            }}
          />
          Crear un grupo
        </label>
      </div>

      {people.isPending && (
        <div className="space-y-2 p-3" aria-busy="true">
          {[1, 2, 3].map((row) => (
            <div key={row} className="h-11 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      )}
      {people.error && (
        <ErrorNote error={people.error} label="Reintentar personas" onRetry={() => void people.refetch()} />
      )}
      {people.data && shown.length === 0 && (
        <p className="p-6 text-center text-sm text-muted-foreground">
          {people.data.length === 0
            ? "Todavía no hay otros usuarios en tu empresa."
            : "Nadie coincide con la búsqueda."}
        </p>
      )}

      <ul className="min-h-0 flex-1 overflow-y-auto">
        {shown.map((person) => {
          const fullName = personName(person);
          return (
            <li key={person.id}>
              {group ? (
                <label className="flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2.5 hover:bg-muted/50">
                  <Checkbox
                    checked={picked.includes(person.id)}
                    onCheckedChange={() => toggle(person.id)}
                  />
                  <ChatAvatar name={fullName} />
                  <span className="truncate text-sm">{fullName}</span>
                </label>
              ) : (
                <button
                  type="button"
                  disabled={open.isPending}
                  onClick={() => open.mutate({ ids: [person.id] })}
                  className="flex w-full items-center gap-3 border-b border-border px-3 py-2.5 text-left hover:bg-muted/50 disabled:opacity-60"
                >
                  <ChatAvatar name={fullName} />
                  <span className="truncate text-sm">{fullName}</span>
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {open.error && (
        <p role="alert" className="px-3 pb-2 text-sm text-destructive">
          {apiErrorMessage(open.error, "No se pudo abrir el chat.")}
        </p>
      )}
      {group && (
        <form
          className="space-y-2 border-t border-border p-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (picked.length >= 2 && name.trim() && !open.isPending) {
              open.mutate({ ids: picked, name: name.trim() });
            }
          }}
        >
          <Label htmlFor="chat-group-name">Nombre del grupo</Label>
          <Input
            id="chat-group-name"
            value={name}
            maxLength={80}
            placeholder="Cobranzas, Depósito, Ventas…"
            onChange={(event) => setName(event.target.value)}
          />
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {picked.length < 2
                ? "Elegí al menos dos personas."
                : `${picked.length} personas elegidas.`}
            </p>
            <Button type="submit" size="sm" disabled={picked.length < 2 || !name.trim() || open.isPending}>
              {open.isPending ? "Creando..." : "Crear grupo"}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
