'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Bell, Package, CreditCard, FileText, Settings, X, CheckCircle } from 'lucide-react';
import { alertsApi, type AlertConfig, type AlertType } from '../../../../lib/api/alerts';

// ── Alert type metadata ────────────────────────────────────────────────────────

const META: Record<AlertType, { label: string; icon: React.ElementType; color: string; href: string; desc: (cfg: AlertConfig) => string }> = {
  STOCK_LOW: {
    label: 'Stock bajo',
    icon: Package,
    color: 'var(--warn)',
    href: '/dashboard/inventory',
    desc: (c) => c.threshold != null ? `Umbral configurado: ${c.threshold} unidades` : 'Sin umbral definido',
  },
  PAYMENT_DUE: {
    label: 'Pagos próximos',
    icon: CreditCard,
    color: 'var(--info)',
    href: '/dashboard/payments',
    desc: () => 'Notificación activa para pagos próximos a vencer',
  },
  INVOICE_OVERDUE: {
    label: 'Facturas vencidas',
    icon: FileText,
    color: 'var(--danger)',
    href: '/dashboard/billing',
    desc: () => 'Notificación activa para facturas vencidas',
  },
};

const CHANNEL_LABEL: Record<string, string> = {
  EMAIL: 'Email',
  SYSTEM: 'Sistema',
};

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

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Bell button */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          position: 'relative',
          width: '36px', height: '36px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '1px solid var(--border)', borderRadius: '9px',
          background: open ? 'var(--panel-2)' : 'var(--panel-2)',
          color: open ? 'var(--ink)' : 'var(--muted)',
          cursor: 'pointer', transition: 'color 0.12s',
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--ink)'; }}
        onMouseLeave={(e) => { if (!open) (e.currentTarget as HTMLElement).style.color = 'var(--muted)'; }}
      >
        <Bell size={16} />
        {count > 0 && (
          <span style={{
            position: 'absolute', top: '6px', right: '6px',
            minWidth: '7px', height: '7px', borderRadius: '50%',
            background: 'var(--danger)',
            border: '2px solid var(--panel-2)',
          }} />
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="animate-rise-in"
          style={{
            position: 'absolute', top: 'calc(100% + 8px)', right: 0,
            width: '320px', maxHeight: '480px',
            background: 'var(--panel)',
            border: '1px solid var(--border)',
            borderRadius: '14px',
            boxShadow: 'var(--shadow-lg)',
            zIndex: 50,
            overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 16px 10px',
            borderBottom: '1px solid var(--border)',
          }}>
            <div>
              <p style={{ fontWeight: 700, fontSize: '14px', color: 'var(--ink)' }}>Alertas</p>
              <p style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '1px' }}>
                {count > 0 ? `${count} regla${count !== 1 ? 's' : ''} activa${count !== 1 ? 's' : ''}` : 'Sin alertas activas'}
              </p>
            </div>
            <button
              onClick={() => setOpen(false)}
              style={{
                width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: 'none', borderRadius: '7px', background: 'transparent',
                color: 'var(--muted)', cursor: 'pointer',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--panel-2)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <X size={14} />
            </button>
          </div>

          {/* Body */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {isLoading ? (
              <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {[1, 2].map((i) => (
                  <div key={i} style={{ height: '60px', borderRadius: '10px', background: 'var(--panel-2)', animation: 'pulse 1.5s infinite' }} />
                ))}
              </div>
            ) : active.length === 0 ? (
              <div style={{ padding: '32px 20px', textAlign: 'center' }}>
                <CheckCircle size={28} style={{ color: 'var(--faint)', margin: '0 auto 10px' }} />
                <p style={{ fontSize: '13.5px', color: 'var(--muted)', fontWeight: 500 }}>Sin alertas activas</p>
                <p style={{ fontSize: '12.5px', color: 'var(--faint)', marginTop: '4px' }}>
                  Configurá alertas para recibir notificaciones automáticas
                </p>
              </div>
            ) : (
              <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {active.map((cfg) => {
                  const meta = META[cfg.type];
                  if (!meta) return null;
                  const Icon = meta.icon;
                  return (
                    <Link
                      key={cfg.id}
                      href={meta.href}
                      onClick={() => setOpen(false)}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: '11px',
                        padding: '11px 12px',
                        borderRadius: '10px',
                        textDecoration: 'none',
                        transition: 'background 0.12s',
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--panel-2)'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                    >
                      {/* Icon pill */}
                      <div style={{
                        width: '34px', height: '34px', flexShrink: 0, borderRadius: '9px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: `color-mix(in srgb, ${meta.color} 14%, transparent)`,
                        color: meta.color,
                      }}>
                        <Icon size={16} />
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--ink)', lineHeight: 1.2 }}>
                          {meta.label}
                        </p>
                        <p style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '3px', lineHeight: 1.4 }}>
                          {meta.desc(cfg)}
                        </p>
                        {cfg.channel && (
                          <span style={{
                            display: 'inline-block', marginTop: '5px',
                            fontSize: '11px', fontWeight: 600,
                            padding: '1px 7px', borderRadius: '5px',
                            background: 'var(--panel-2)', color: 'var(--faint)',
                            border: '1px solid var(--border)',
                          }}>
                            {CHANNEL_LABEL[cfg.channel] ?? cfg.channel}
                          </span>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{
            borderTop: '1px solid var(--border)',
            padding: '10px 16px',
          }}>
            <Link
              href="/dashboard/settings/alerts"
              onClick={() => setOpen(false)}
              style={{
                display: 'flex', alignItems: 'center', gap: '7px',
                fontSize: '13px', fontWeight: 500, color: 'var(--muted)',
                textDecoration: 'none', transition: 'color 0.12s',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--ink)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--muted)'; }}
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
