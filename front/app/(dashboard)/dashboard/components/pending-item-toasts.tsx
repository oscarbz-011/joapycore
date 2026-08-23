'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import { useAuth } from '../../../../lib/auth-context';
import { subscribeWsEvent, type WsEvent } from '../../../../lib/ws-event-bus';
import { TOAST_EVENT_MAP } from '../../../../lib/toast-event-map';

interface PendingToast {
  id: string;
  title: string;
  href: string;
  icon: (typeof TOAST_EVENT_MAP)[string]['icon'];
}

const AUTO_DISMISS_MS = 7000;

// Aviso breve cuando llega un ítem nuevo a la cola de pendientes de alguien
// (factura sin emitir, pedido a evaluar, ajuste pedido, entrega para
// despachar) mientras el usuario ya está trabajando en el sistema — antes
// de esto el único indicio era que el número del badge cambiaba en
// silencio. Se suscribe al bus de front/lib/ws-event-bus.ts en vez de abrir
// su propio socket — front/lib/use-ws-connection.ts sigue siendo el único
// dueño de la conexión (deja la invalidación de queries donde ya estaba y
// solo agrega la parte visual).
export function PendingItemToasts() {
  const { isAuthenticated, jwtPayload } = useAuth();
  const permissions = jwtPayload?.permissions;
  const activeModules = jwtPayload?.activeModules;
  const [toasts, setToasts] = useState<PendingToast[]>([]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const handler = (event: WsEvent) => {
      const config = TOAST_EVENT_MAP[event.type];
      if (!config) return;
      if (!permissions?.includes(config.permission)) return;
      if (!activeModules?.includes(config.module)) return;
      const id = `${event.type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((prev) => [...prev, { id, title: config.title, href: config.href, icon: config.icon }]);
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), AUTO_DISMISS_MS);
    };

    return subscribeWsEvent(handler);
  }, [isAuthenticated, permissions, activeModules]);

  function dismiss(id: string) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-[100] flex w-80 flex-col gap-2">
      {toasts.map((t) => {
        const Icon = t.icon;
        return (
          <div
            key={t.id}
            className="animate-rise-in flex items-start gap-3 rounded-2xl border border-border bg-card p-3.5 shadow-lg"
          >
            <div className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-primary/10 text-primary">
              <Icon size={15} />
            </div>
            <Link
              href={t.href}
              onClick={() => dismiss(t.id)}
              className="min-w-0 flex-1 text-[13px] font-medium leading-snug text-foreground no-underline hover:underline"
            >
              {t.title}
            </Link>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="shrink-0 text-muted-foreground/50 hover:text-foreground"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
