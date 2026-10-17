"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { chatApi } from "@/lib/api/chat";

export const CHAT_PATH = "/dashboard/chat";

// Todas empiezan con "chat": un aviso por WebSocket las refresca juntas.
export function chatKeys(tenantId?: string, userId?: string) {
  const base = ["chat", tenantId, userId] as const;
  return {
    base,
    unread: [...base, "unread"] as const,
    conversations: [...base, "conversations"] as const,
    people: [...base, "people"] as const,
    messages: (conversationId: string) => [...base, "messages", conversationId] as const,
  };
}

export function useChatIdentity() {
  const { jwtPayload, isAuthenticated } = useAuth();
  return { tenantId: jwtPayload?.tenantId, userId: jwtPayload?.sub, isAuthenticated };
}

export function useChatUnread(): number {
  const { tenantId, userId, isAuthenticated } = useChatIdentity();
  const unread = useQuery({
    queryKey: chatKeys(tenantId, userId).unread,
    queryFn: chatApi.unread,
    enabled: isAuthenticated && !!userId,
    refetchInterval: 60000,
  });
  return unread.data?.unread ?? 0;
}
