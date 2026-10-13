"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { communicationsApi } from "@/lib/api/communications";
import { CommunicationDate, CommunicationError, Pagination } from "../shared";
import { communicationKeys, useCommunicationAccess } from "./use-communications";

export function NoticesList({
  canOpenConversations,
  onOpenConversation,
}: {
  canOpenConversations: boolean;
  onOpenConversation: (contactId: string) => void;
}) {
  const { tenantId, userId } = useCommunicationAccess();
  const key = communicationKeys(tenantId, userId).notices;
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
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
    <section
      aria-label="Mis avisos"
      className="flex min-h-0 min-w-0 flex-col rounded-2xl border border-border bg-card lg:col-span-2"
    >
      <div className="border-b border-border p-4">
        <h2 className="text-sm font-semibold">
          Mis avisos
          {list.data && list.data.unreadCount > 0 ? ` · ${list.data.unreadCount} sin leer` : ""}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Qué pasó con los correos que pediste enviar.
        </p>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {list.isPending && (
          <div className="space-y-2" aria-busy="true">
            {[1, 2, 3].map((row) => (
              <div key={row} className="h-16 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        )}
        {list.error && (
          <div className="space-y-3">
            <CommunicationError error={list.error} />
            <Button variant="outline" size="sm" onClick={() => void list.refetch()}>
              Reintentar avisos
            </Button>
          </div>
        )}
        {read.error && <CommunicationError error={read.error} />}
        {list.data?.items.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
            <BellOff size={26} />
            <p>No tenés avisos.</p>
          </div>
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
              {item.body && (
                <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                  {item.body}
                </p>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                <CommunicationDate value={item.createdAt} />
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {canOpenConversations && item.contact && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onOpenConversation(item.contact!.id)}
                >
                  Ver conversación
                </Button>
              )}
              {!item.readAt && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={read.isPending}
                  onClick={() => read.mutate(item.id)}
                >
                  Marcar leído
                </Button>
              )}
            </div>
          </article>
        ))}
        {list.data && <Pagination page={page} total={list.data.total} onChange={setPage} />}
      </div>
    </section>
  );
}
