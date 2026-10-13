"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, MessageSquare, SendHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { apiErrorMessage } from "@/lib/api/api-error";
import { chatApi, type ChatConversation, type ChatMessage } from "@/lib/api/chat";
import { conversationTitle, mergeMessages, messageTime, personName, threadDays } from "@/lib/chat";
import { ChatAvatar } from "./chat-list";
import { chatKeys, useChatIdentity } from "./use-chat";

export function ChatThread({
  conversationId,
  onBack,
}: {
  conversationId: string;
  onBack: () => void;
}) {
  const { tenantId, userId } = useChatIdentity();
  const keys = chatKeys(tenantId, userId);
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const [older, setOlder] = useState<{ items: ChatMessage[]; hasMore: boolean } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const conversations = useQuery({
    queryKey: keys.conversations,
    queryFn: chatApi.conversations,
    refetchInterval: 30000,
  });
  const conversation = conversations.data?.find((item) => item.id === conversationId);
  const latest = useQuery({
    queryKey: keys.messages(conversationId),
    queryFn: () => chatApi.messages(conversationId),
    refetchInterval: 20000,
  });
  const messages = mergeMessages(latest.data?.items ?? [], older?.items ?? []);
  const hasMore = older ? older.hasMore : (latest.data?.hasMore ?? false);
  const newestId = messages[0]?.id;

  const loadOlder = useMutation({
    mutationFn: () => chatApi.messages(conversationId, messages[messages.length - 1]?.createdAt),
    onSuccess: (page) =>
      setOlder((current) => ({
        items: [...(current?.items ?? []), ...page.items],
        hasMore: page.hasMore,
      })),
  });
  const send = useMutation({
    mutationFn: () => chatApi.send(conversationId, body.trim()),
    onSuccess: () => {
      setBody("");
      void queryClient.invalidateQueries({ queryKey: keys.base });
    },
  });
  const { mutate: markRead } = useMutation({
    mutationFn: () => chatApi.markRead(conversationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.conversations });
      void queryClient.invalidateQueries({ queryKey: keys.unread });
    },
  });

  // Con la conversación abierta, lo que llega queda leído.
  const unread = conversation?.unread ?? 0;
  useEffect(() => {
    if (unread > 0) markRead();
  }, [unread, newestId, markRead]);

  // Lo más nuevo está abajo.
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [newestId]);

  const submit = () => {
    if (body.trim() && !send.isPending) send.mutate();
  };
  const days = threadDays(messages, conversation?.participants ?? [], userId);

  return (
    <section
      aria-label="Chat"
      className="flex min-h-0 min-w-0 flex-col rounded-2xl border border-border bg-card"
    >
      <div className="flex items-center gap-3 border-b border-border p-4">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onBack}
          aria-label="Volver a las conversaciones"
          className="lg:hidden"
        >
          <ArrowLeft size={16} />
        </Button>
        {conversation ? (
          <ThreadHeader conversation={conversation} meId={userId} />
        ) : conversations.isPending ? (
          <div className="h-9 flex-1 animate-pulse rounded-xl bg-muted" aria-busy="true" />
        ) : (
          <p className="text-sm text-muted-foreground">Conversación no encontrada.</p>
        )}
      </div>

      <div ref={scroller} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {latest.isPending && (
          <div className="space-y-2" aria-busy="true">
            {[1, 2, 3].map((row) => (
              <div key={row} className="h-10 w-2/3 animate-pulse rounded-2xl bg-muted" />
            ))}
          </div>
        )}
        {latest.error && (
          <div className="space-y-3">
            <p
              role="alert"
              className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive"
            >
              {apiErrorMessage(latest.error, "No se pudieron cargar los mensajes.")}
            </p>
            <Button variant="outline" size="sm" onClick={() => void latest.refetch()}>
              Reintentar mensajes
            </Button>
          </div>
        )}
        {hasMore && (
          <div className="flex justify-center">
            <Button
              variant="outline"
              size="sm"
              disabled={loadOlder.isPending}
              onClick={() => loadOlder.mutate()}
            >
              {loadOlder.isPending ? "Cargando..." : "Ver mensajes anteriores"}
            </Button>
          </div>
        )}
        {latest.data && messages.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
            <MessageSquare size={26} />
            <p>Todavía no hay mensajes. Escribí el primero.</p>
          </div>
        )}
        {days.map((day) => (
          <div key={day.day} className="space-y-1.5">
            <p className="py-1 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {day.day}
            </p>
            {day.messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex flex-col",
                  message.mine ? "items-end" : "items-start",
                  message.startsRun && "pt-2",
                )}
              >
                {message.startsRun && !message.mine && conversation?.kind === "GROUP" && (
                  <span className="mb-0.5 px-1 text-xs font-medium text-muted-foreground">
                    {message.senderName}
                  </span>
                )}
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-3 py-2 text-sm",
                    message.mine
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground",
                  )}
                >
                  <p className="whitespace-pre-wrap break-words leading-relaxed">{message.body}</p>
                  <time
                    dateTime={message.createdAt}
                    className={cn(
                      "mt-0.5 block text-right text-[10px]",
                      message.mine ? "text-primary-foreground/70" : "text-muted-foreground",
                    )}
                  >
                    {messageTime(message.createdAt)}
                  </time>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      <form
        className="space-y-2 border-t border-border p-3"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        {send.error && (
          <p role="alert" className="text-sm text-destructive">
            {apiErrorMessage(send.error, "No se pudo enviar el mensaje.")}
          </p>
        )}
        <div className="flex items-end gap-2">
          <Textarea
            aria-label="Mensaje"
            value={body}
            maxLength={4000}
            rows={1}
            placeholder="Escribí un mensaje"
            className="max-h-32 min-h-9 resize-none"
            onChange={(event) => setBody(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
          />
          <Button
            type="submit"
            size="icon"
            aria-label="Enviar mensaje"
            disabled={!body.trim() || send.isPending || !conversation}
          >
            <SendHorizontal size={16} />
          </Button>
        </div>
      </form>
    </section>
  );
}

function ThreadHeader({
  conversation,
  meId,
}: {
  conversation: ChatConversation;
  meId: string | undefined;
}) {
  const title = conversationTitle(conversation, meId);
  const isGroup = conversation.kind === "GROUP";
  return (
    <div className="flex min-w-0 items-center gap-3">
      <ChatAvatar name={title} group={isGroup} />
      <div className="min-w-0">
        <h2 className="truncate text-base font-semibold">{title}</h2>
        {isGroup && (
          <p className="truncate text-xs text-muted-foreground">
            {conversation.participants
              .map((person) => (person.id === meId ? "Vos" : personName(person)))
              .join(", ")}
          </p>
        )}
      </div>
    </div>
  );
}
