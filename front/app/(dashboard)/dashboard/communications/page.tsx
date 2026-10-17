"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Bell, MessageSquare, Settings, Users } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { COMMUNICATIONS_PATH, communicationsApi } from "@/lib/api/communications";
import {
  BOXES,
  inboxHref,
  parseSelection,
  type BoxId,
  type Selection,
} from "@/lib/communications-inbox";
import { CommunicationError } from "@/components/communications/shared";
import { ConversationList } from "@/components/communications/inbox/conversation-list";
import { ConversationThread } from "@/components/communications/inbox/conversation-thread";
import { NoticesList } from "@/components/communications/inbox/notices-list";
import {
  communicationKeys,
  useCommunicationAccess,
  useCommunicationsAttention,
} from "@/components/communications/inbox/use-communications";

const SETTINGS_PATH = "/dashboard/settings?tab=communications";
const BOX_ICONS: Record<BoxId, React.ElementType> = {
  customers: Users,
  problems: AlertTriangle,
  notices: Bell,
};

export default function CommunicationsPage() {
  return (
    <Suspense fallback={null}>
      <Inbox />
    </Suspense>
  );
}

function Inbox() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { tenantId, userId, access, canRead, canManage } = useCommunicationAccess();
  const settings = useQuery({
    queryKey: communicationKeys(tenantId, userId).settings,
    queryFn: communicationsApi.settings,
    enabled: access,
  });
  const requested = parseSelection(searchParams);
  const selection: Selection = canRead ? requested : { box: "notices", contactId: null };
  const go = (next: Selection) =>
    router.replace(inboxHref(COMMUNICATIONS_PATH, next), { scroll: false });

  if (!access)
    return (
      <p className="text-sm text-muted-foreground">
        No tenés permiso para acceder a Comunicaciones.
      </p>
    );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Comunicaciones</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Lo que tu empresa habló con cada cliente, junto con las notas de tu equipo.
          </p>
        </div>
        {canManage && (
          <Link href={SETTINGS_PATH} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            <Settings size={14} /> Configuración
          </Link>
        )}
      </div>

      {settings.isPending && (
        <div className="h-64 animate-pulse rounded-2xl bg-muted" aria-busy="true" />
      )}
      {settings.error && (
        <div className="space-y-3">
          <CommunicationError error={settings.error} />
          <Button variant="outline" onClick={() => void settings.refetch()}>
            Reintentar
          </Button>
        </div>
      )}
      {settings.data && !settings.data.enabled && (
        <div className="space-y-3 rounded-2xl border border-border bg-card p-8">
          <MessageSquare size={26} className="text-muted-foreground" />
          <h2 className="font-semibold">Comunicaciones todavía no está activado</h2>
          <p className="max-w-xl text-sm text-muted-foreground">
            Definí desde qué dirección salen los correos de tu empresa y activalo para
            empezar a ver las conversaciones con tus clientes.
          </p>
          {canManage ? (
            <Link href={SETTINGS_PATH} className={cn(buttonVariants())}>
              Abrir configuración
            </Link>
          ) : (
            <p className="text-sm text-muted-foreground">
              Un administrador puede activarlo desde Configuración.
            </p>
          )}
        </div>
      )}

      {settings.data?.enabled && (
        <>
          {canRead && !settings.data.emailEnabled && (
            <p role="status" className="rounded-xl border border-border bg-muted/40 p-3 text-sm">
              El envío de correos está desactivado. Las conversaciones anteriores se pueden
              seguir consultando.
            </p>
          )}
          <div className="grid gap-4 lg:h-[calc(100dvh-15rem)] lg:min-h-[520px] lg:grid-cols-[190px_minmax(260px,340px)_minmax(0,1fr)]">
            <Boxes
              selection={selection}
              showConversations={canRead}
              className={cn(selection.contactId && "hidden lg:flex")}
              onSelect={(box) => go({ box, contactId: null })}
            />
            {selection.box === "notices" ? (
              <NoticesList
                key={`${tenantId}:${userId}`}
                canOpenConversations={canRead}
                onOpenConversation={(contactId) => go({ box: "customers", contactId })}
              />
            ) : (
              <>
                <div
                  className={cn(
                    "min-h-0 lg:flex lg:flex-col",
                    selection.contactId ? "hidden" : "flex flex-col",
                  )}
                >
                  <ConversationList
                    key={`${tenantId}:${userId}:${selection.box}`}
                    onlyProblems={selection.box === "problems"}
                    selectedId={selection.contactId}
                    onSelect={(contactId) => go({ ...selection, contactId })}
                  />
                </div>
                {selection.contactId ? (
                  <ConversationThread
                    key={`${tenantId}:${userId}:${selection.contactId}`}
                    contactId={selection.contactId}
                    onBack={() => go({ ...selection, contactId: null })}
                  />
                ) : (
                  <div className="hidden flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground lg:flex">
                    <MessageSquare size={28} />
                    <p>Elegí una conversación para ver los correos y las notas.</p>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Boxes({
  selection,
  showConversations,
  className,
  onSelect,
}: {
  selection: Selection;
  showConversations: boolean;
  className?: string;
  onSelect: (box: BoxId) => void;
}) {
  const attention = useCommunicationsAttention();
  const counts: Partial<Record<BoxId, number>> = {
    problems: attention.problems,
    notices: attention.unreadNotices,
  };
  const boxes = BOXES.filter((box) => showConversations || box.id === "notices");
  const sections = [...new Set(boxes.map((box) => box.section))];

  return (
    <nav
      aria-label="Bandejas"
      className={cn("flex flex-wrap content-start gap-x-1 gap-y-3 lg:flex-col lg:flex-nowrap", className)}
    >
      {sections.map((section) => (
        <div key={section} className="flex flex-wrap items-center gap-1 lg:flex-col lg:items-stretch">
          <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70 max-lg:hidden">
            {section}
          </p>
          {boxes
            .filter((box) => box.section === section)
            .map((box) => {
              const Icon = BOX_ICONS[box.id];
              const active = selection.box === box.id;
              const count = counts[box.id];
              return (
                <button
                  key={box.id}
                  type="button"
                  onClick={() => onSelect(box.id)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors",
                    active
                      ? "bg-[var(--accent-soft)] font-medium text-[var(--accent-text)]"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  <Icon size={15} className="shrink-0" />
                  <span className="flex-1">{box.label}</span>
                  {!!count && (
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-px text-[11px] font-bold leading-none",
                        box.id === "problems"
                          ? "bg-destructive/15 text-destructive"
                          : "bg-[var(--accent-soft)] text-[var(--accent-text)]",
                      )}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
        </div>
      ))}
    </nav>
  );
}
