'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Bell, Package, CreditCard, FileText, Settings, X, CheckCircle } from 'lucide-react';
import { alertsApi, type AlertConfig, type AlertType } from '../../../../lib/api/alerts';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

// ── Alert type metadata ────────────────────────────────────────────────────────

const META: Record<AlertType, {
  label: string;
  icon: React.ElementType;
  color: string;
  href: string;
  desc: (cfg: AlertConfig) => string;
}> = {
  STOCK_LOW: {
    label: 'Stock bajo', icon: Package, color: 'var(--warn)',
    href: '/dashboard/inventory',
    desc: (c) => c.threshold != null ? `Umbral: ${c.threshold} unidades` : 'Sin umbral definido',
  },
  PAYMENT_DUE: {
    label: 'Pagos próximos', icon: CreditCard, color: 'var(--info)',
    href: '/dashboard/payments',
    desc: () => 'Notificación activa para pagos próximos a vencer',
  },
  INVOICE_OVERDUE: {
    label: 'Facturas vencidas', icon: FileText, color: 'var(--danger)',
    href: '/dashboard/billing',
    desc: () => 'Notificación activa para facturas vencidas',
  },
};

const CHANNEL_LABEL: Record<string, string> = { EMAIL: 'Email', SYSTEM: 'Sistema' };

// ── Component ──────────────────────────────────────────────────────────────────

export function AlertsDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data: configs = [], isLoading } = useQuery({
    queryKey: ['alert-configs'],
    queryFn: alertsApi.getConfigs,
  });

  const active = configs.filter((c) => c.isActive);
  const count  = active.length;

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <Button
        variant="outline"
        size="icon-sm"
        onClick={() => setOpen((v) => !v)}
        title="Alertas"
        className="relative text-muted-foreground"
      >
        <Bell size={15} />
        {count > 0 && (
          <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-destructive ring-2 ring-background" />
        )}
      </Button>

      {open && (
        <div className="animate-rise-in absolute right-0 top-[calc(100%+8px)] z-50 flex w-80 max-h-[480px] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-[14px] font-semibold text-foreground">Alertas</p>
              <p className="mt-px text-[12px] text-muted-foreground">
                {count > 0 ? `${count} regla${count !== 1 ? 's' : ''} activa${count !== 1 ? 's' : ''}` : 'Sin alertas activas'}
              </p>
            </div>
            <Button variant="ghost" size="icon-xs" onClick={() => setOpen(false)}>
              <X size={13} />
            </Button>
          </div>

          <Separator />

          {/* Body */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex flex-col gap-2.5 p-4">
                {[1, 2].map((i) => (
                  <div key={i} className="h-14 animate-pulse rounded-xl bg-muted" />
                ))}
              </div>
            ) : active.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-center">
                <CheckCircle size={28} className="mb-2.5 text-muted-foreground/40" />
                <p className="text-[13.5px] font-medium text-foreground">Sin alertas activas</p>
                <p className="mt-1 text-[12.5px] text-muted-foreground">
                  Configurá alertas para recibir notificaciones automáticas
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-1 p-2.5">
                {active.map((cfg) => {
                  const meta = META[cfg.type];
                  if (!meta) return null;
                  const Icon = meta.icon;
                  return (
                    <Link
                      key={cfg.id}
                      href={meta.href}
                      onClick={() => setOpen(false)}
                      className="flex items-start gap-3 rounded-xl p-3 no-underline transition-colors hover:bg-muted"
                    >
                      <div
                        className="flex size-9 shrink-0 items-center justify-center rounded-[9px]"
                        style={{ background: `color-mix(in srgb, ${meta.color} 14%, transparent)`, color: meta.color }}
                      >
                        <Icon size={16} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13.5px] font-semibold leading-tight text-foreground">{meta.label}</p>
                        <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{meta.desc(cfg)}</p>
                        {cfg.channel && (
                          <Badge variant="secondary" className="mt-1.5 text-[10px] font-semibold">
                            {CHANNEL_LABEL[cfg.channel] ?? cfg.channel}
                          </Badge>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          <Separator />

          {/* Footer */}
          <div className="px-4 py-2.5">
            <Link
              href="/dashboard/settings/alerts"
              onClick={() => setOpen(false)}
              className="flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground no-underline transition-colors hover:text-foreground"
            >
              <Settings size={13} />
              Gestionar configuración de alertas
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
