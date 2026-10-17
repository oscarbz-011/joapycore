"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { usePermission } from "@/lib/permissions";
import { useActiveModules } from "@/lib/use-active-modules";
import { communicationsApi } from "@/lib/api/communications";
import { attentionCount } from "@/lib/communications-inbox";

export function useCommunicationAccess() {
  const { jwtPayload } = useAuth();
  const { hasModule } = useActiveModules();
  const access = usePermission("communications:access");
  const canReadDeliveries = usePermission("communications:delivery:read");
  const canReadInvoices = usePermission("billing:read");
  return {
    tenantId: jwtPayload?.tenantId,
    userId: jwtPayload?.sub,
    access,
    // Hoy todo lo que hay en una conversación son correos de facturas.
    canRead:
      access && canReadDeliveries && canReadInvoices && hasModule("billing"),
    canManage: usePermission("communications:settings:manage"),
    canNote: usePermission("communications:notes:create"),
    canSend: usePermission("communications:email:send"),
  };
}

export function communicationKeys(tenantId?: string, userId?: string) {
  const base = ["communications", tenantId, userId] as const;
  return {
    base,
    settings: [...base, "settings"] as const,
    summary: [...base, "conversations-summary"] as const,
    conversations: [...base, "conversations"] as const,
    thread: [...base, "thread"] as const,
    message: [...base, "messages", "detail"] as const,
    notices: ["communication-notifications", tenantId, userId] as const,
  };
}

/** Lo que espera atención en Comunicaciones: para el menú y la campana. */
export function useCommunicationsAttention() {
  const { tenantId, userId, access, canRead } = useCommunicationAccess();
  const keys = communicationKeys(tenantId, userId);
  const settings = useQuery({
    queryKey: keys.settings,
    queryFn: communicationsApi.settings,
    enabled: access,
  });
  const enabled = settings.data?.enabled === true;
  const summary = useQuery({
    queryKey: keys.summary,
    queryFn: communicationsApi.conversationsSummary,
    enabled: enabled && canRead,
    refetchInterval: 60000,
  });
  const notices = useQuery({
    queryKey: [...keys.notices, 1],
    queryFn: () => communicationsApi.notifications(1),
    enabled,
    refetchInterval: 60000,
  });
  const problems = summary.data?.problemConversations ?? 0;
  const unreadNotices = notices.data?.unreadCount ?? 0;
  return {
    problems,
    unreadNotices,
    total: attentionCount(summary.data, unreadNotices),
  };
}
