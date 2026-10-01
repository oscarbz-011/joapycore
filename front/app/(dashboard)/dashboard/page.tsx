'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  ShoppingCart, Package, CreditCard, Users, FileText, Truck,
  TrendingUp, TrendingDown, ArrowRight, Box, SlidersHorizontal,
  Eye, EyeOff, RotateCcw,
} from 'lucide-react';
import { useAuth } from '../../../lib/auth-context';
import { salesApi } from '../../../lib/api/sales';
import type { SaleOrder } from '../../../lib/api/sales';
import { inventoryApi } from '../../../lib/api/inventory';
import type { ProductWithStock } from '../../../lib/api/inventory';
import { paymentsApi } from '../../../lib/api/payments';
import { localISODate } from '../../../lib/date';
import { auditApi } from '../../../lib/api/audit';
import type { AuditLog } from '../../../lib/api/audit';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardAction, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────────

type DashboardView = 'operativo' | 'financiero' | 'compacto';

const WIDGET_DEFS = {
  chart_revenue:  'Gráfico de facturación',
  chart_ar:       'Gráfico de cobranzas',
  stock_critical: 'Stock crítico',
  activity:       'Actividad reciente',
  top_products:   'Top productos',
} as const;
type WidgetKey = keyof typeof WIDGET_DEFS;

const DEFAULT_WIDGETS: Record<WidgetKey, boolean> = {
  chart_revenue: true, chart_ar: true, stock_critical: true,
  activity: true, top_products: true,
};

const STORAGE_KEY_VIEW    = 'joappy-dashboard-view';
const STORAGE_KEY_WIDGETS = 'joappy-dashboard-widgets';

// ── Helpers ────────────────────────────────────────────────────────────────────

const MES_CORTO = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

function fmtGs(n: number) {
  return 'Gs. ' + new Intl.NumberFormat('es-PY').format(Math.round(n));
}

const ACTIVE_STATUSES: SaleOrder['status'][] = ['CONFIRMED', 'CREDIT_APPROVED', 'INVOICED'];
const OPEN_STATUSES:   SaleOrder['status'][] = ['PENDING', 'PENDING_CREDIT_APPROVAL', 'CREDIT_APPROVED', 'CONFIRMED'];

function orderTotal(o: SaleOrder) { return o.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0); }
function inMonth(dateStr: string, year: number, month: number) {
  const d = new Date(dateStr);
  return d.getFullYear() === year && d.getMonth() === month;
}
function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'ahora mismo';
  if (m < 60) return `hace ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  return `hace ${Math.floor(h / 24)}d`;
}

const ACTION_MAP: Record<string, string> = {
  'user.created': 'Usuario creado', 'user.deactivated': 'Usuario desactivado',
  'user.reactivated': 'Usuario reactivado', 'sale.order.completed': 'Pedido completado',
  'sale.order.confirmed': 'Pedido confirmado', 'sale.order.cancelled': 'Pedido cancelado',
  'invoice.issued': 'Factura emitida', 'invoice.cancelled': 'Factura cancelada',
  'stock.movement.created': 'Movimiento de stock', 'hr.employee.created': 'Empleado registrado',
  'payment.registered': 'Pago registrado', 'tenant.updated': 'Empresa actualizada',
};
const MODULE_COLORS: Record<string, string> = {
  users: '#6366f1', sales: '#059669', inventory: '#0284c7',
  billing: '#d97706', procurement: '#7c3aed', payments: '#db2777',
  hr: '#b45309', tenant: '#475569', auth: '#64748b',
};

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  if (status === 'INVOICED' || status === 'DELIVERED') return <Badge variant="default">{status}</Badge>;
  if (status === 'CONFIRMED' || status === 'CREDIT_APPROVED') return <Badge variant="secondary">{status}</Badge>;
  if (status === 'CANCELLED' || status === 'CREDIT_REJECTED') return <Badge variant="destructive">{status}</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({ icon: Icon, label, value, delta, spark = [], danger = false, loading = false }: {
  icon: React.ElementType; label: string; value: string;
  delta?: number | null; spark?: number[]; danger?: boolean; loading?: boolean;
}) {
  const pos = (delta ?? 0) >= 0;
  return (
    <Card>
      <CardHeader>
        <div className="flex size-8 items-center justify-center rounded-[9px] bg-accent-subtle text-accent-on">
          <Icon size={15} />
        </div>
        {delta != null && (
          <CardAction>
            <Badge
              variant={pos ? 'secondary' : 'destructive'}
              className="gap-1"
            >
              {pos ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
              {Math.abs(delta).toFixed(1)}%
            </Badge>
          </CardAction>
        )}
        {delta == null && danger && (
          <CardAction>
            <Badge variant="destructive"><TrendingDown size={10} /></Badge>
          </CardAction>
        )}
        <CardTitle className="text-[13px] text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-7 w-32 animate-pulse rounded-md bg-muted" />
        ) : (
          <p className={cn('text-[23px] font-extrabold tracking-tight tabular-nums', danger ? 'text-destructive' : 'text-foreground')}>
            {value}
          </p>
        )}
        {spark.length > 0 && (
          <div className="mt-3 flex h-[26px] items-end gap-[3px]">
            {spark.map((v, i) => (
              <div
                key={i}
                className="flex-1 rounded-sm"
                style={{
                  height: `${Math.max(5, Math.round(v * 100))}%`,
                  background: i === spark.length - 1 ? 'var(--accent-text)' : 'var(--border-strong)',
                }}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Compact KPI ───────────────────────────────────────────────────────────────

function CompactKpi({ label, value, delta, danger = false }: {
  label: string; value: string; delta?: number | null; danger?: boolean;
}) {
  const pos = (delta ?? 0) >= 0;
  return (
    <Card size="sm">
      <CardContent>
        <p className="text-[12px] font-medium text-muted-foreground">{label}</p>
        <p className={cn('mt-1 text-[20px] font-extrabold tabular-nums', danger ? 'text-destructive' : 'text-foreground')}>
          {value}
        </p>
        {delta != null && (
          <p className={cn('mt-0.5 text-[11.5px] font-semibold', pos ? 'text-accent-on' : 'text-destructive')}>
            {pos ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}%
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Revenue chart ─────────────────────────────────────────────────────────────

function RevenueChart({ months }: { months: { label: string; total: number; isCurrent: boolean }[] }) {
  const max  = Math.max(...months.map((m) => m.total), 1);
  const cur  = months[months.length - 1];
  const prev = months[months.length - 2];
  const delta = prev?.total > 0 ? ((cur.total - prev.total) / prev.total) * 100 : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Facturación</CardTitle>
        <CardDescription>Últimos 12 meses</CardDescription>
        <CardAction className="text-right">
          <p className="text-[21px] font-extrabold tabular-nums text-foreground">{fmtGs(cur?.total ?? 0)}</p>
          {delta != null && (
            <p className={cn('text-[12px] font-semibold', delta >= 0 ? 'text-accent-on' : 'text-destructive')}>
              {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}% vs. mes anterior
            </p>
          )}
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-[7px]" style={{ height: '160px' }}>
          {months.map((m) => (
            <div key={m.label} className="flex flex-1 flex-col items-center gap-1.5">
              <div
                className="w-full max-w-[28px] rounded-t-[5px] rounded-b-[3px]"
                style={{
                  height: `${Math.max(4, Math.round((m.total / max) * 130))}px`,
                  background: m.isCurrent
                    ? 'linear-gradient(180deg, var(--accent-text), var(--accent-strong))'
                    : 'var(--border-strong)',
                  boxShadow: m.isCurrent ? '0 4px 12px rgba(16,185,129,0.3)' : 'none',
                }}
              />
              <span className={cn('text-[10.5px]', m.isCurrent ? 'font-bold text-foreground' : 'text-muted-foreground/50')}>
                {m.label}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── AR Donut ──────────────────────────────────────────────────────────────────

function ArDonut({ paid, pending, overdue }: { paid: number; pending: number; overdue: number }) {
  const total   = paid + pending + overdue;
  const paidPct = total > 0 ? (paid / total) * 100 : 0;
  const pendPct = total > 0 ? (pending / total) * 100 : 0;
  const cobPct  = total > 0 ? Math.round(paidPct) : 0;

  const gradient = total > 0
    ? `conic-gradient(var(--accent-text) 0 ${paidPct}%, var(--warn) ${paidPct}% ${paidPct + pendPct}%, var(--danger) ${paidPct + pendPct}% 100%)`
    : 'conic-gradient(var(--border-strong) 0 100%)';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cobranzas</CardTitle>
        <CardDescription>Estado de cuentas por cobrar</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex justify-center">
          <div className="flex items-center justify-center rounded-full" style={{ width: '136px', height: '136px', background: gradient }}>
            <div className="flex flex-col items-center justify-center rounded-full bg-card" style={{ width: '96px', height: '96px' }}>
              <p className="text-[22px] font-extrabold text-foreground">{cobPct}%</p>
              <p className="text-[11px] text-muted-foreground">cobrado</p>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-2.5">
          {[
            { color: 'var(--accent-text)', label: 'Cobrado',    value: paid },
            { color: 'var(--warn)',   label: 'Por vencer', value: pending },
            { color: 'var(--danger)', label: 'Vencido',    value: overdue },
          ].map((row) => (
            <div key={row.label} className="flex items-center gap-2.5 text-[13px]">
              <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: row.color }} />
              <span className="flex-1 text-muted-foreground">{row.label}</span>
              <span className="font-bold tabular-nums text-foreground">{fmtGs(row.value)}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Personalize Sheet ─────────────────────────────────────────────────────────

function PersonalizeSheet({ open, onOpenChange, widgets, onChange }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  widgets: Record<WidgetKey, boolean>;
  onChange: (k: WidgetKey, v: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-[300px] flex-col p-0 sm:max-w-[300px]" showCloseButton>
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle>Personalizar dashboard</SheetTitle>
          <SheetDescription>Activa o desactiva los paneles.</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="flex flex-col gap-3">
            {(Object.keys(WIDGET_DEFS) as WidgetKey[]).map((key) => (
              <label
                key={key}
                className="flex cursor-pointer items-center justify-between rounded-xl border border-border p-3 hover:bg-muted transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="flex size-8 items-center justify-center rounded-[7px] bg-accent-subtle text-accent-on">
                    {widgets[key] ? <Eye size={13} /> : <EyeOff size={13} className="opacity-50" />}
                  </span>
                  <span className="text-[13.5px] font-medium text-foreground">{WIDGET_DEFS[key]}</span>
                </div>
                <button
                  type="button"
                  onClick={() => onChange(key, !widgets[key])}
                  className={cn(
                    'relative inline-flex h-[22px] w-[40px] shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none',
                    widgets[key] ? 'bg-primary' : 'bg-input',
                  )}
                >
                  <span
                    className={cn(
                      'inline-block size-[18px] transform rounded-full bg-white shadow transition-transform',
                      widgets[key] ? 'translate-x-[18px]' : 'translate-x-0',
                    )}
                  />
                </button>
              </label>
            ))}
          </div>
        </div>

        <Separator />

        <div className="px-5 py-4">
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={() => (Object.keys(DEFAULT_WIDGETS) as WidgetKey[]).forEach((k) => onChange(k, DEFAULT_WIDGETS[k]))}
          >
            <RotateCcw size={13} />
            Restablecer por defecto
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user, jwtPayload } = useAuth();
  const activeModules = jwtPayload?.activeModules ?? [];
  const tenantName    = jwtPayload?.tenantName ?? '';
  const now   = useMemo(() => new Date(), []);
  const today = useMemo(() => now.toLocaleDateString('es-PY', { weekday: 'long', day: 'numeric', month: 'long' }), [now]);

  const [view, setView] = useState<DashboardView>(() => {
    if (typeof window === 'undefined') return 'operativo';
    return (localStorage.getItem(STORAGE_KEY_VIEW) as DashboardView | null) ?? 'operativo';
  });
  const [widgets, setWidgets] = useState<Record<WidgetKey, boolean>>(() => {
    if (typeof window === 'undefined') return DEFAULT_WIDGETS;
    const saved = localStorage.getItem(STORAGE_KEY_WIDGETS);
    if (saved) { try { return JSON.parse(saved) as Record<WidgetKey, boolean>; } catch { /* ignore */ } }
    return DEFAULT_WIDGETS;
  });
  const [showPersonalize, setShowPersonalize] = useState(false);

  function setViewPersisted(v: DashboardView) { setView(v); localStorage.setItem(STORAGE_KEY_VIEW, v); }
  function setWidget(k: WidgetKey, v: boolean) {
    setWidgets((prev) => {
      const next = { ...prev, [k]: v };
      localStorage.setItem(STORAGE_KEY_WIDGETS, JSON.stringify(next));
      return next;
    });
  }

  // ── Data ────────────────────────────────────────────────────────────────────

  const { data: orders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ['orders'], queryFn: salesApi.listOrders,
    enabled: activeModules.includes('sales'),
  });
  const { data: products = [], isLoading: prodLoading } = useQuery<ProductWithStock[]>({
    queryKey: ['products-with-stock'],
    queryFn: () => inventoryApi.listProductsWithStock({ status: 'ACTIVE' }),
    enabled: activeModules.includes('inventory'),
  });
  const { data: arList = [], isLoading: arLoading } = useQuery({
    queryKey: ['ar'], queryFn: paymentsApi.listAR,
    enabled: activeModules.includes('payments'),
  });
  const { data: auditResp } = useQuery({
    queryKey: ['audit-recent'],
    queryFn: () => auditApi.getLogs({ limit: 8, page: 1 }),
    staleTime: 30_000,
  });
  const recentLogs: AuditLog[] = auditResp?.data ?? [];

  // ── KPIs ───────────────────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const thisM = now.getMonth(), thisY = now.getFullYear();
    const lastM = thisM === 0 ? 11 : thisM - 1, lastY = thisM === 0 ? thisY - 1 : thisY;
    // orderDate es un instante real (no un día de calendario elegido) — hay
    // que anclar a Paraguay explícito, no comparar contra el prefijo UTC
    // crudo (ver localISODate en lib/date.ts).
    const todayStr = localISODate(now);

    const ordersHoy     = orders.filter((o) => localISODate(o.orderDate) === todayStr).length;
    const thisMonthAct  = orders.filter((o) => ACTIVE_STATUSES.includes(o.status) && inMonth(o.orderDate, thisY, thisM));
    const lastMonthAct  = orders.filter((o) => ACTIVE_STATUSES.includes(o.status) && inMonth(o.orderDate, lastY, lastM));
    const ventas        = thisMonthAct.reduce((s, o) => s + orderTotal(o), 0);
    const ventasPrev    = lastMonthAct.reduce((s, o) => s + orderTotal(o), 0);
    const ventasDelta   = ventasPrev > 0 ? ((ventas - ventasPrev) / ventasPrev) * 100 : null;
    const abiertas      = orders.filter((o) => OPEN_STATUSES.includes(o.status)).length;
    const ticketPromedio = thisMonthAct.length > 0 ? ventas / thisMonthAct.length : 0;
    const ticketPrev    = lastMonthAct.length > 0 ? ventasPrev / lastMonthAct.length : 0;
    const ticketDelta   = ticketPrev > 0 ? ((ticketPromedio - ticketPrev) / ticketPrev) * 100 : null;
    const criticos      = products.filter((p) => p.stock <= 3);
    const pendAR        = arList.filter((ar) => ar.status === 'PENDING' || ar.status === 'PARTIAL');
    const porCobrar     = pendAR.reduce((s, ar) => s + (Number(ar.amount) - Number(ar.paidAmount)), 0);
    const overdueAR     = pendAR.filter((ar) => ar.dueDate && new Date(ar.dueDate) < now);
    const vencido       = overdueAR.reduce((s, ar) => s + (Number(ar.amount) - Number(ar.paidAmount)), 0);
    const cobrado       = arList.reduce((s, ar) => s + Number(ar.paidAmount), 0);
    const pendiente     = porCobrar - vencido;
    const cobradoMes    = arList.flatMap((ar) => ar.paymentRecords)
      .filter((p) => inMonth(p.paymentDate, thisY, thisM))
      .reduce((s, p) => s + Number(p.amount), 0);

    return { ordersHoy, ventas, ventasDelta, abiertas, ticketPromedio, ticketDelta, criticos, porCobrar, vencido, pendiente, cobrado, cobradoMes };
  }, [orders, products, arList, now]);

  const monthlyRevenue = useMemo(() => Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
    const y = d.getFullYear(), m = d.getMonth();
    const total = orders.filter((o) => ACTIVE_STATUSES.includes(o.status) && inMonth(o.orderDate, y, m))
      .reduce((s, o) => s + orderTotal(o), 0);
    return { label: MES_CORTO[m], total, isCurrent: i === 11 };
  }), [orders, now]);

  const topProducts = useMemo(() => {
    const map = new Map<string, { name: string; total: number; qty: number }>();
    orders.filter((o) => ACTIVE_STATUSES.includes(o.status)).forEach((o) =>
      o.items.forEach((item) => {
        if (!item.productId || !item.product) return; // ítem libre, sin catálogo
        const prev = map.get(item.productId);
        const amt  = item.unitPrice * item.quantity;
        if (prev) { prev.total += amt; prev.qty += item.quantity; }
        else map.set(item.productId, { name: item.product.name, total: amt, qty: item.quantity });
      })
    );
    return Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 5);
  }, [orders]);

  const spark = useMemo(() => {
    const max = Math.max(...monthlyRevenue.map((m) => m.total), 1);
    return monthlyRevenue.slice(-6).map((m) => m.total / max);
  }, [monthlyRevenue]);

  const topMax  = Math.max(...topProducts.map((p) => p.total), 1);
  const lowStock = [...kpis.criticos].sort((a, b) => a.stock - b.stock).slice(0, 4);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-start gap-4">
        <div className="flex-1">
          <h1 className="text-[25px] font-extrabold tracking-tight text-foreground">
            Hola, {user?.firstName} 👋
          </h1>
          <p className="mt-1 text-[14px] text-muted-foreground">
            Resumen de {tenantName} · {today}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* View switcher */}
          <div className="flex rounded-xl border border-border bg-muted/50 p-1 gap-1">
            {(['operativo', 'financiero', 'compacto'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setViewPersisted(v)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-[12.5px] font-semibold capitalize transition-all',
                  view === v
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>

          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setShowPersonalize(true)}
          >
            <SlidersHorizontal size={13} />
            Personalizar
          </Button>
        </div>
      </div>

      {/* ══ COMPACTO ════════════════════════════════════════════════════════ */}
      {view === 'compacto' && (
        <>
          <div className="mb-5 grid grid-cols-3 gap-4">
            <CompactKpi label="Órdenes hoy"        value={String(kpis.ordersHoy)} />
            <CompactKpi label="Facturación del mes" value={fmtGs(kpis.ventas)}        delta={kpis.ventasDelta} />
            <CompactKpi label="Ticket promedio"     value={fmtGs(kpis.ticketPromedio)} delta={kpis.ticketDelta} />
            <CompactKpi label="Stock crítico"       value={String(kpis.criticos.length)} danger={kpis.criticos.length > 0} />
            <CompactKpi label="Por cobrar"          value={fmtGs(kpis.porCobrar)} />
            <CompactKpi label="Cobrado"             value={fmtGs(kpis.cobrado)} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Órdenes recientes</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {orders.length === 0 ? (
                <p className="px-6 pb-6 text-[13px] text-muted-foreground">Sin órdenes registradas.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[13.5px]">
                    <thead>
                      <tr className="border-y border-border bg-muted/30 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                        <th className="px-5 py-2.5 text-left">Cliente</th>
                        <th className="px-5 py-2.5 text-left">Estado</th>
                        <th className="px-5 py-2.5 text-right">Total</th>
                        <th className="px-5 py-2.5 text-right">Fecha</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {orders.slice(0, 8).map((o) => (
                        <tr key={o.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-5 py-2.5 text-foreground">{o.customer.firstName} {o.customer.lastName}</td>
                          <td className="px-5 py-2.5"><StatusBadge status={o.status} /></td>
                          <td className="px-5 py-2.5 text-right font-mono font-semibold text-foreground">{fmtGs(orderTotal(o))}</td>
                          <td className="px-5 py-2.5 text-right text-muted-foreground">
                            {new Date(o.orderDate).toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* ══ OPERATIVO / FINANCIERO ══════════════════════════════════════════ */}
      {view !== 'compacto' && (
        <>
          {/* KPI row */}
          <div className="mb-5 grid grid-cols-4 gap-4">
            {view === 'operativo' ? (
              <>
                <KpiCard icon={FileText}     label="Órdenes hoy"        value={String(kpis.ordersHoy)}          spark={spark}       loading={ordersLoading} />
                <KpiCard icon={ShoppingCart} label="Facturación del mes" value={fmtGs(kpis.ventas)}        delta={kpis.ventasDelta} spark={spark} loading={ordersLoading} />
                <KpiCard icon={CreditCard}   label="Ticket promedio"    value={fmtGs(kpis.ticketPromedio)} delta={kpis.ticketDelta} spark={spark} loading={ordersLoading} />
                <KpiCard icon={Package}      label="Stock crítico"      value={String(kpis.criticos.length)}    danger={kpis.criticos.length > 0} loading={prodLoading} />
              </>
            ) : (
              <>
                <KpiCard icon={ShoppingCart} label="Facturación del mes" value={fmtGs(kpis.ventas)}       delta={kpis.ventasDelta} spark={spark} loading={ordersLoading} />
                <KpiCard icon={CreditCard}   label="Por cobrar"          value={fmtGs(kpis.porCobrar)}    loading={arLoading} />
                <KpiCard icon={CreditCard}   label="Cobrado este mes"    value={fmtGs(kpis.cobradoMes)}   loading={arLoading} />
                <KpiCard icon={FileText}     label="Ticket promedio"     value={fmtGs(kpis.ticketPromedio)} delta={kpis.ticketDelta} loading={ordersLoading} />
              </>
            )}
          </div>

          {/* Charts */}
          {(widgets.chart_revenue || widgets.chart_ar) && (
            <div
              className="mb-5 grid gap-4"
              style={{ gridTemplateColumns: widgets.chart_ar ? '2fr 1fr' : '1fr' }}
            >
              {widgets.chart_revenue && <RevenueChart months={monthlyRevenue} />}
              {widgets.chart_ar && (
                <ArDonut paid={kpis.cobrado} pending={kpis.pendiente} overdue={kpis.vencido} />
              )}
            </div>
          )}

          {/* Bottom widgets */}
          {(() => {
            const active = [widgets.stock_critical, widgets.activity, widgets.top_products].filter(Boolean).length;
            return (
              <div className={cn('grid gap-4', active === 3 ? 'grid-cols-3' : active === 2 ? 'grid-cols-2' : 'grid-cols-1')}>

                {widgets.stock_critical && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Stock crítico</CardTitle>
                      <CardAction>
                        <Link href="/dashboard/inventory/stock" className="text-[12px] font-semibold text-primary hover:underline">
                          Ver todo
                        </Link>
                      </CardAction>
                    </CardHeader>
                    <CardContent>
                      {lowStock.length === 0 ? (
                        <p className="py-4 text-center text-[13px] text-muted-foreground">
                          {prodLoading ? 'Cargando…' : 'Sin alertas de stock'}
                        </p>
                      ) : (
                        <div className="flex flex-col gap-1">
                          {lowStock.map((p) => (
                            <div key={p.id} className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-muted">
                              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground">
                                <Box size={14} />
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-[13px] font-semibold text-foreground">{p.name}</p>
                                {p.model && <p className="truncate font-mono text-[11px] text-muted-foreground">{p.model}</p>}
                              </div>
                              <Badge variant={p.stock === 0 ? 'destructive' : 'outline'}>
                                {p.stock === 0 ? 'Agotado' : `${p.stock} u.`}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {widgets.activity && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Actividad reciente</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {recentLogs.length === 0 ? (
                        <p className="py-4 text-center text-[13px] text-muted-foreground">Sin actividad reciente</p>
                      ) : (
                        recentLogs.map((log, idx) => {
                          const action = ACTION_MAP[log.action] ?? log.action;
                          const who    = log.user ? `${log.user.firstName} ${log.user.lastName}` : 'Sistema';
                          const color  = MODULE_COLORS[log.module] ?? '#64748b';
                          return (
                            <div key={log.id} className="flex gap-3 py-1.5">
                              <div className="flex flex-col items-center">
                                <span
                                  className="flex size-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold"
                                  style={{ background: color + '22', color }}
                                >
                                  {log.module.slice(0, 2).toUpperCase()}
                                </span>
                                {idx < recentLogs.length - 1 && (
                                  <span className="my-1 w-px flex-1 bg-border" />
                                )}
                              </div>
                              <div className="pb-1.5">
                                <p className="text-[13px] leading-snug text-foreground">{action}</p>
                                <p className="mt-px text-[11.5px] text-muted-foreground">{who} · {timeAgo(log.createdAt)}</p>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </CardContent>
                  </Card>
                )}

                {widgets.top_products && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Top productos del mes</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {topProducts.length === 0 ? (
                        <p className="py-4 text-center text-[13px] text-muted-foreground">
                          {ordersLoading ? 'Cargando…' : 'Sin ventas registradas'}
                        </p>
                      ) : (
                        <div className="flex flex-col">
                          {topProducts.map((p, i) => (
                            <div key={p.name} className="border-t border-border py-2.5">
                              <div className="mb-1.5 flex items-center gap-2">
                                <span className="w-[18px] text-[12px] font-bold tabular-nums text-muted-foreground">
                                  {String(i + 1).padStart(2, '0')}
                                </span>
                                <span className="flex-1 truncate text-[13px] font-semibold text-foreground">{p.name}</span>
                                <span className="font-mono text-[12px] text-muted-foreground">{p.qty} u.</span>
                                <span className="font-mono text-[12px] font-bold text-foreground">{fmtGs(p.total)}</span>
                              </div>
                              <div className="h-[4px] overflow-hidden rounded-full bg-muted ml-6">
                                <div
                                  className="h-full rounded-full bg-primary"
                                  style={{ width: `${Math.round((p.total / topMax) * 100)}%` }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            );
          })()}

          {/* Módulos disponibles cuando sales no está activo */}
          {!activeModules.includes('sales') && view === 'operativo' && (
            <div className="mt-6">
              <p className="mb-3 text-[14px] font-semibold text-foreground">Módulos disponibles</p>
              <div className="grid grid-cols-3 gap-3">
                {([
                  { key: 'sales',       label: 'Ventas',      href: '/dashboard/sales',       icon: ShoppingCart },
                  { key: 'inventory',   label: 'Inventario',  href: '/dashboard/inventory/products', icon: Package },
                  { key: 'billing',     label: 'Facturación', href: '/dashboard/billing',     icon: FileText },
                  { key: 'procurement', label: 'Compras',     href: '/dashboard/procurement', icon: Truck },
                  { key: 'payments',    label: 'Cuentas',     href: '/dashboard/payments',    icon: CreditCard },
                  { key: 'hr',          label: 'RRHH',        href: '/dashboard/hr',          icon: Users },
                ] as const)
                  .filter(({ key }) => activeModules.includes(key))
                  .map(({ label, href, icon: Icon }) => (
                    <Link key={href} href={href} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 no-underline transition-colors hover:border-border-strong hover:bg-muted/30">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-subtle text-accent-on">
                        <Icon size={16} />
                      </span>
                      <span className="flex-1 text-[14px] font-semibold text-foreground">{label}</span>
                      <ArrowRight size={14} className="shrink-0 text-muted-foreground" />
                    </Link>
                  ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Personalizar sheet */}
      <PersonalizeSheet
        open={showPersonalize}
        onOpenChange={setShowPersonalize}
        widgets={widgets}
        onChange={setWidget}
      />
    </div>
  );
}
