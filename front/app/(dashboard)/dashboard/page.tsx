'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  ShoppingCart, Package, CreditCard, Users, FileText, Truck,
  TrendingUp, TrendingDown, ArrowRight, Box, SlidersHorizontal,
  X, Eye, EyeOff, RotateCcw,
} from 'lucide-react';
import { useAuth } from '../../../lib/auth-context';
import { salesApi } from '../../../lib/api/sales';
import type { SaleOrder } from '../../../lib/api/sales';
import { inventoryApi } from '../../../lib/api/inventory';
import type { ProductWithStock } from '../../../lib/api/inventory';
import { paymentsApi } from '../../../lib/api/payments';
import { auditApi } from '../../../lib/api/audit';
import type { AuditLog } from '../../../lib/api/audit';

// ── Types ──────────────────────────────────────────────────────────────────────

type DashboardView = 'operativo' | 'financiero' | 'compacto';

const WIDGET_DEFS = {
  chart_revenue: 'Gráfico de facturación',
  chart_ar:      'Gráfico de cobranzas',
  stock_critical:'Stock crítico',
  activity:      'Actividad reciente',
  top_products:  'Top productos',
} as const;
type WidgetKey = keyof typeof WIDGET_DEFS;

const DEFAULT_WIDGETS: Record<WidgetKey, boolean> = {
  chart_revenue:  true,
  chart_ar:       true,
  stock_critical: true,
  activity:       true,
  top_products:   true,
};

const STORAGE_KEY_VIEW    = 'joappy-dashboard-view';
const STORAGE_KEY_WIDGETS = 'joappy-dashboard-widgets';

// ── Helpers ────────────────────────────────────────────────────────────────────

const MES_CORTO = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

function fmtGs(n: number) {
  return 'Gs. ' + new Intl.NumberFormat('es-PY').format(Math.round(n));
}

const ACTIVE_STATUSES: SaleOrder['status'][] = ['CONFIRMED', 'CREDIT_APPROVED', 'INVOICED'];
const OPEN_STATUSES: SaleOrder['status'][]   = ['PENDING', 'PENDING_CREDIT_APPROVAL', 'CREDIT_APPROVED', 'CONFIRMED'];

function orderTotal(o: SaleOrder) {
  return o.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
}
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
  'user.created':           'Usuario creado',
  'user.deactivated':       'Usuario desactivado',
  'user.reactivated':       'Usuario reactivado',
  'sale.order.completed':   'Pedido completado',
  'sale.order.confirmed':   'Pedido confirmado',
  'sale.order.cancelled':   'Pedido cancelado',
  'invoice.issued':         'Factura emitida',
  'invoice.cancelled':      'Factura cancelada',
  'stock.movement.created': 'Movimiento de stock',
  'hr.employee.created':    'Empleado registrado',
  'payment.registered':     'Pago registrado',
  'tenant.updated':         'Empresa actualizada',
};
const MODULE_COLORS: Record<string, string> = {
  users: '#6366f1', sales: '#059669', inventory: '#0284c7',
  billing: '#d97706', procurement: '#7c3aed', payments: '#db2777',
  hr: '#b45309', tenant: '#475569', auth: '#64748b',
};

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon, label, value, delta, spark = [], danger = false, loading = false,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  delta?: number | null;
  spark?: number[];
  danger?: boolean;
  loading?: boolean;
}) {
  const pos = (delta ?? 0) >= 0;
  return (
    <div className="rounded-[15px] border border-border bg-surface p-[17px_18px] shadow-[var(--shadow-sm)]">
      <div className="mb-[13px] flex items-center justify-between">
        <span className="flex h-[34px] w-[34px] items-center justify-center rounded-[9px] bg-accent-subtle text-accent-on">
          <Icon size={16} />
        </span>
        {delta != null && (
          <span className={`flex items-center gap-1 rounded-[7px] px-[7px] py-[3px] text-[12px] font-bold ${
            pos ? 'bg-accent-subtle text-accent-on' : 'bg-danger-subtle text-danger'
          }`}>
            {pos ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {Math.abs(delta).toFixed(1)}%
          </span>
        )}
        {delta == null && danger && (
          <span className="flex items-center gap-1 rounded-[7px] bg-danger-subtle px-[7px] py-[3px] text-[12px] font-bold text-danger">
            <TrendingDown size={11} />
          </span>
        )}
      </div>
      <p className="text-[13px] font-medium text-muted">{label}</p>
      {loading ? (
        <div className="mt-1 h-7 w-32 animate-pulse rounded-md bg-border" />
      ) : (
        <p className={`mt-0.5 text-[23px] font-extrabold tracking-tight tabular-nums ${danger ? 'text-danger' : 'text-ink'}`}>
          {value}
        </p>
      )}
      {spark.length > 0 && (
        <div className="mt-[11px] flex h-[26px] items-end gap-[3px]">
          {spark.map((v, i) => (
            <div
              key={i}
              className="flex-1 rounded-sm"
              style={{
                height: `${Math.max(5, Math.round(v * 100))}%`,
                background: i === spark.length - 1 ? 'var(--accent)' : 'var(--border-strong)',
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Compact KPI ───────────────────────────────────────────────────────────────

function CompactKpi({ label, value, delta, danger = false }: {
  label: string; value: string; delta?: number | null; danger?: boolean;
}) {
  const pos = (delta ?? 0) >= 0;
  return (
    <div className="rounded-[14px] border border-border bg-surface p-[14px_16px] shadow-[var(--shadow-sm)]">
      <p className="text-[12px] font-medium text-muted">{label}</p>
      <p className={`mt-[3px] text-[20px] font-extrabold tabular-nums ${danger ? 'text-danger' : 'text-ink'}`}>{value}</p>
      {delta != null && (
        <p className={`mt-[2px] text-[11.5px] font-semibold ${pos ? 'text-accent-on' : 'text-danger'}`}>
          {pos ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}%
        </p>
      )}
    </div>
  );
}

// ── Revenue chart ─────────────────────────────────────────────────────────────

function RevenueChart({ months }: { months: { label: string; total: number; isCurrent: boolean }[] }) {
  const max = Math.max(...months.map((m) => m.total), 1);
  const cur = months[months.length - 1];
  const prev = months[months.length - 2];
  const delta = prev?.total > 0 ? ((cur.total - prev.total) / prev.total) * 100 : null;

  return (
    <div className="rounded-[15px] border border-border bg-surface p-[20px_22px] shadow-[var(--shadow-sm)]">
      <div className="mb-[6px] flex items-start justify-between">
        <div>
          <p className="text-[15px] font-bold text-ink">Facturación</p>
          <p className="text-[12.5px] text-muted">Últimos 12 meses</p>
        </div>
        <div className="text-right">
          <p className="text-[21px] font-extrabold tabular-nums text-ink">{fmtGs(cur?.total ?? 0)}</p>
          {delta != null && (
            <p className={`text-[12.5px] font-semibold ${delta >= 0 ? 'text-accent-on' : 'text-danger'}`}>
              {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}% vs. mes anterior
            </p>
          )}
        </div>
      </div>
      <div className="flex items-end gap-[7px] pt-[18px]" style={{ height: '160px' }}>
        {months.map((m) => (
          <div key={m.label} className="flex flex-1 flex-col items-center gap-[6px]">
            <div
              className="w-full max-w-[28px] rounded-[5px_5px_3px_3px]"
              style={{
                height: `${Math.max(4, Math.round((m.total / max) * 130))}px`,
                background: m.isCurrent
                  ? 'linear-gradient(180deg, var(--accent), var(--accent-strong))'
                  : 'var(--border-strong)',
                boxShadow: m.isCurrent ? '0 4px 12px rgba(16,185,129,0.3)' : 'none',
              }}
            />
            <span className={`text-[10.5px] ${m.isCurrent ? 'font-bold text-ink' : 'text-faint'}`}>{m.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── AR Donut ──────────────────────────────────────────────────────────────────

function ArDonut({ paid, pending, overdue }: { paid: number; pending: number; overdue: number }) {
  const total = paid + pending + overdue;
  const paidPct = total > 0 ? (paid / total) * 100 : 0;
  const pendPct = total > 0 ? (pending / total) * 100 : 0;
  const cobPct  = total > 0 ? Math.round(paidPct) : 0;

  const gradient = total > 0
    ? `conic-gradient(var(--accent) 0 ${paidPct}%, var(--warn) ${paidPct}% ${paidPct + pendPct}%, var(--danger) ${paidPct + pendPct}% 100%)`
    : 'conic-gradient(var(--border-strong) 0 100%)';

  return (
    <div className="rounded-[15px] border border-border bg-surface p-[20px_22px] shadow-[var(--shadow-sm)]">
      <p className="text-[15px] font-bold text-ink">Cobranzas</p>
      <p className="mb-[14px] mt-[2px] text-[12.5px] text-muted">Estado de cuentas por cobrar</p>
      <div className="my-[4px] mb-[16px] flex justify-center">
        <div className="flex items-center justify-center rounded-full" style={{ width: '136px', height: '136px', background: gradient }}>
          <div className="flex flex-col items-center justify-center rounded-full bg-surface" style={{ width: '96px', height: '96px' }}>
            <p className="text-[22px] font-extrabold text-ink">{cobPct}%</p>
            <p className="text-[11px] text-muted">cobrado</p>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-[9px]">
        {[
          { color: 'var(--accent)', label: 'Cobrado',    value: paid },
          { color: 'var(--warn)',   label: 'Por vencer', value: pending },
          { color: 'var(--danger)', label: 'Vencido',    value: overdue },
        ].map((row) => (
          <div key={row.label} className="flex items-center gap-[9px] text-[13px]">
            <span className="h-[9px] w-[9px] rounded-[3px]" style={{ background: row.color }} />
            <span className="flex-1 text-muted">{row.label}</span>
            <span className="font-bold tabular-nums text-ink">{fmtGs(row.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Personalize drawer ────────────────────────────────────────────────────────

function PersonalizeDrawer({
  widgets, onChange, onClose,
}: {
  widgets: Record<WidgetKey, boolean>;
  onChange: (k: WidgetKey, v: boolean) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <aside
        className="relative z-50 flex h-full w-[300px] flex-col shadow-[var(--shadow-lg)] animate-slide-in"
        style={{ background: 'var(--panel)' }}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <p className="text-[15px] font-bold text-ink">Personalizar dashboard</p>
          <button onClick={onClose} className="rounded-[8px] p-1.5 text-muted hover:bg-surface-2"><X size={17} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="mb-4 text-[12.5px] text-muted">Activa o desactiva los paneles que aparecen en el dashboard.</p>
          <div className="flex flex-col gap-3">
            {(Object.keys(WIDGET_DEFS) as WidgetKey[]).map((key) => (
              <label key={key} className="flex cursor-pointer items-center justify-between rounded-[11px] border border-border p-[11px_14px] hover:bg-surface-2">
                <div className="flex items-center gap-3">
                  <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[7px] bg-accent-subtle text-accent-on">
                    {widgets[key] ? <Eye size={14} /> : <EyeOff size={14} className="text-faint" />}
                  </span>
                  <span className="text-[13.5px] font-medium text-ink">{WIDGET_DEFS[key]}</span>
                </div>
                <button
                  onClick={() => onChange(key, !widgets[key])}
                  className={`relative inline-flex h-[22px] w-[40px] shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                    widgets[key] ? 'bg-accent' : 'bg-border-strong'
                  }`}
                >
                  <span className={`inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow transition-transform ${
                    widgets[key] ? 'translate-x-[18px]' : 'translate-x-0'
                  }`} />
                </button>
              </label>
            ))}
          </div>
        </div>

        <div className="border-t border-border px-5 py-4">
          <button
            onClick={() => (Object.keys(DEFAULT_WIDGETS) as WidgetKey[]).forEach((k) => onChange(k, DEFAULT_WIDGETS[k]))}
            className="flex w-full items-center justify-center gap-2 rounded-[9px] border border-border py-2 text-[13.5px] text-muted hover:bg-surface-2"
          >
            <RotateCcw size={14} />
            Restablecer por defecto
          </button>
        </div>
      </aside>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user, jwtPayload } = useAuth();
  const activeModules = jwtPayload?.activeModules ?? [];
  const tenantName    = jwtPayload?.tenantName ?? '';

  const today = new Date().toLocaleDateString('es-PY', { weekday: 'long', day: 'numeric', month: 'long' });
  const now   = new Date();

  // ── Persisted state ────────────────────────────────────────────────────────
  const [view, setView] = useState<DashboardView>('operativo');
  const [widgets, setWidgets] = useState<Record<WidgetKey, boolean>>(DEFAULT_WIDGETS);
  const [showPersonalize, setShowPersonalize] = useState(false);

  useEffect(() => {
    const savedView = localStorage.getItem(STORAGE_KEY_VIEW) as DashboardView | null;
    if (savedView) setView(savedView);
    const savedWidgets = localStorage.getItem(STORAGE_KEY_WIDGETS);
    if (savedWidgets) {
      try { setWidgets(JSON.parse(savedWidgets) as Record<WidgetKey, boolean>); } catch { /* ignore */ }
    }
  }, []);

  function setViewPersisted(v: DashboardView) {
    setView(v);
    localStorage.setItem(STORAGE_KEY_VIEW, v);
  }
  function setWidget(k: WidgetKey, v: boolean) {
    setWidgets((prev) => {
      const next = { ...prev, [k]: v };
      localStorage.setItem(STORAGE_KEY_WIDGETS, JSON.stringify(next));
      return next;
    });
  }

  // ── Data fetching ──────────────────────────────────────────────────────────

  const { data: orders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: salesApi.listOrders,
    enabled: activeModules.includes('sales'),
  });

  const { data: products = [], isLoading: prodLoading } = useQuery<ProductWithStock[]>({
    queryKey: ['products-with-stock'],
    queryFn: () => inventoryApi.listProductsWithStock({ isActive: true }),
    enabled: activeModules.includes('inventory'),
  });

  const { data: arList = [], isLoading: arLoading } = useQuery({
    queryKey: ['ar'],
    queryFn: paymentsApi.listAR,
    enabled: activeModules.includes('payments'),
  });

  const { data: auditResp } = useQuery({
    queryKey: ['audit-recent'],
    queryFn: () => auditApi.getLogs({ limit: 8, page: 1 }),
    staleTime: 30_000,
  });
  const recentLogs: AuditLog[] = auditResp?.data ?? [];

  // ── KPI computation ────────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const thisM = now.getMonth(), thisY = now.getFullYear();
    const lastM = thisM === 0 ? 11 : thisM - 1, lastY = thisM === 0 ? thisY - 1 : thisY;
    const todayStr = now.toISOString().slice(0, 10);

    const ordersHoy = orders.filter((o) => o.orderDate.startsWith(todayStr)).length;

    const thisMonthActive = orders.filter(
      (o) => ACTIVE_STATUSES.includes(o.status) && inMonth(o.orderDate, thisY, thisM)
    );
    const lastMonthActive = orders.filter(
      (o) => ACTIVE_STATUSES.includes(o.status) && inMonth(o.orderDate, lastY, lastM)
    );

    const ventas      = thisMonthActive.reduce((s, o) => s + orderTotal(o), 0);
    const ventasPrev  = lastMonthActive.reduce((s, o) => s + orderTotal(o), 0);
    const ventasDelta = ventasPrev > 0 ? ((ventas - ventasPrev) / ventasPrev) * 100 : null;

    const abiertas = orders.filter((o) => OPEN_STATUSES.includes(o.status)).length;

    const ticketPromedio = thisMonthActive.length > 0
      ? ventas / thisMonthActive.length
      : 0;
    const ticketPrev = lastMonthActive.length > 0
      ? ventasPrev / lastMonthActive.length
      : 0;
    const ticketDelta = ticketPrev > 0 ? ((ticketPromedio - ticketPrev) / ticketPrev) * 100 : null;

    const criticos = products.filter((p) => p.stock <= 3);

    const pendAR    = arList.filter((ar) => ar.status === 'PENDING' || ar.status === 'PARTIAL');
    const porCobrar = pendAR.reduce((s, ar) => s + (ar.amount - ar.paidAmount), 0);
    const overdueAR = pendAR.filter((ar) => ar.dueDate && new Date(ar.dueDate) < now);
    const vencido   = overdueAR.reduce((s, ar) => s + (ar.amount - ar.paidAmount), 0);
    const cobrado   = arList.reduce((s, ar) => s + ar.paidAmount, 0);
    const pendiente = porCobrar - vencido;

    const cobradoMes = arList
      .flatMap((ar) => ar.paymentRecords)
      .filter((p) => inMonth(p.paymentDate, thisY, thisM))
      .reduce((s, p) => s + p.amount, 0);

    return {
      ordersHoy, ventas, ventasDelta, abiertas,
      ticketPromedio, ticketDelta,
      criticos, porCobrar, vencido, pendiente, cobrado, cobradoMes,
    };
  }, [orders, products, arList, now]);

  // ── Monthly chart (12 months) ──────────────────────────────────────────────

  const monthlyRevenue = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
      const y = d.getFullYear(), m = d.getMonth();
      const total = orders
        .filter((o) => ACTIVE_STATUSES.includes(o.status) && inMonth(o.orderDate, y, m))
        .reduce((s, o) => s + orderTotal(o), 0);
      return { label: MES_CORTO[m], total, isCurrent: i === 11 };
    });
  }, [orders, now]);

  // ── Top products ───────────────────────────────────────────────────────────

  const topProducts = useMemo(() => {
    const map = new Map<string, { name: string; total: number; qty: number }>();
    orders.filter((o) => ACTIVE_STATUSES.includes(o.status)).forEach((o) =>
      o.items.forEach((item) => {
        const prev = map.get(item.productId);
        const amt  = item.unitPrice * item.quantity;
        if (prev) { prev.total += amt; prev.qty += item.quantity; }
        else map.set(item.productId, { name: item.product.name, total: amt, qty: item.quantity });
      })
    );
    return Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 5);
  }, [orders]);

  // ── Sparklines ─────────────────────────────────────────────────────────────

  const spark = useMemo(() => {
    const max = Math.max(...monthlyRevenue.map((m) => m.total), 1);
    return monthlyRevenue.slice(-6).map((m) => m.total / max);
  }, [monthlyRevenue]);

  const topMax = Math.max(...topProducts.map((p) => p.total), 1);
  const lowStock = [...kpis.criticos].sort((a, b) => a.stock - b.stock).slice(0, 4);
  const isLoading = ordersLoading || prodLoading || arLoading;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div className="mb-[22px] flex items-start gap-4">
        <div className="flex-1">
          <h1 className="m-0 text-[25px] font-extrabold tracking-tight text-ink">
            Hola, {user?.firstName} 👋
          </h1>
          <p className="mt-[5px] text-[14px] text-muted">
            Resumen de {tenantName} · {today}
          </p>
        </div>

        {/* View switcher */}
        <div className="flex items-center gap-2">
          <div className="flex rounded-[10px] border border-border bg-surface-2 p-[3px] shadow-[var(--shadow-sm)]">
            {(['operativo', 'financiero', 'compacto'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setViewPersisted(v)}
                className={`rounded-[7px] px-[13px] py-[6px] text-[13px] font-semibold capitalize transition-colors ${
                  view === v
                    ? 'bg-accent text-white shadow-[0_2px_6px_rgba(16,185,129,0.3)]'
                    : 'text-muted hover:text-ink'
                }`}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowPersonalize(true)}
            className="flex items-center gap-2 rounded-[10px] border border-border bg-surface px-[12px] py-[8px] text-[13px] font-medium text-muted shadow-[var(--shadow-sm)] hover:text-ink"
          >
            <SlidersHorizontal size={14} />
            Personalizar
          </button>
        </div>
      </div>

      {/* ══ COMPACTO view ═══════════════════════════════════════════════════ */}
      {view === 'compacto' && (
        <>
          <div className="mb-5 grid grid-cols-3 gap-4">
            <CompactKpi label="Órdenes hoy"       value={String(kpis.ordersHoy)}          />
            <CompactKpi label="Facturación del mes" value={fmtGs(kpis.ventas)}        delta={kpis.ventasDelta} />
            <CompactKpi label="Ticket promedio"    value={fmtGs(kpis.ticketPromedio)} delta={kpis.ticketDelta} />
            <CompactKpi label="Stock crítico"      value={String(kpis.criticos.length)}    danger={kpis.criticos.length > 0} />
            <CompactKpi label="Por cobrar"         value={fmtGs(kpis.porCobrar)}      />
            <CompactKpi label="Cobrado"            value={fmtGs(kpis.cobrado)}        />
          </div>

          {/* Compact: recent orders table */}
          <div className="rounded-[15px] border border-border bg-surface shadow-[var(--shadow-sm)]">
            <p className="px-[18px] py-[14px] text-[15px] font-bold text-ink">Órdenes recientes</p>
            {orders.length === 0 ? (
              <p className="px-[18px] pb-5 text-[13px] text-faint">Sin órdenes registradas.</p>
            ) : (
              <table className="w-full text-[13.5px]">
                <thead>
                  <tr className="border-y border-border bg-surface-2 text-[11px] font-bold uppercase tracking-wider text-faint">
                    <th className="px-4 py-2.5 text-left">Cliente</th>
                    <th className="px-4 py-2.5 text-left">Estado</th>
                    <th className="px-4 py-2.5 text-right">Total</th>
                    <th className="px-4 py-2.5 text-right">Fecha</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {orders.slice(0, 8).map((o) => (
                    <tr key={o.id} className="hover:bg-surface-2">
                      <td className="px-4 py-2.5 text-ink">{o.customer.firstName} {o.customer.lastName}</td>
                      <td className="px-4 py-2.5">
                        <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${
                          o.status === 'INVOICED'   ? 'bg-accent-subtle text-accent-on' :
                          o.status === 'CONFIRMED'  ? 'bg-info/10 text-info' :
                          o.status === 'CANCELLED'  ? 'bg-danger-subtle text-danger' :
                          'bg-warn-subtle text-warn'
                        }`}>
                          {o.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono font-semibold text-ink">{fmtGs(orderTotal(o))}</td>
                      <td className="px-4 py-2.5 text-right text-muted">{new Date(o.orderDate).toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* ══ OPERATIVO / FINANCIERO views ═════════════════════════════════════ */}
      {view !== 'compacto' && (
        <>
          {/* KPI row */}
          <div className="mb-[18px] grid grid-cols-4 gap-4">
            {view === 'operativo' ? (
              <>
                <KpiCard icon={FileText}    label="Órdenes hoy"        value={String(kpis.ordersHoy)}          spark={spark}       loading={ordersLoading} />
                <KpiCard icon={ShoppingCart} label="Facturación del mes" value={fmtGs(kpis.ventas)}        delta={kpis.ventasDelta} spark={spark} loading={ordersLoading} />
                <KpiCard icon={CreditCard}  label="Ticket promedio"    value={fmtGs(kpis.ticketPromedio)} delta={kpis.ticketDelta} spark={spark} loading={ordersLoading} />
                <KpiCard icon={Package}     label="Stock crítico"      value={String(kpis.criticos.length)}    danger={kpis.criticos.length > 0} loading={prodLoading} />
              </>
            ) : (
              <>
                <KpiCard icon={ShoppingCart} label="Facturación del mes" value={fmtGs(kpis.ventas)}       delta={kpis.ventasDelta} spark={spark} loading={ordersLoading} />
                <KpiCard icon={CreditCard}  label="Por cobrar"          value={fmtGs(kpis.porCobrar)}    loading={arLoading} />
                <KpiCard icon={CreditCard}  label="Cobrado este mes"    value={fmtGs(kpis.cobradoMes)}   loading={arLoading} />
                <KpiCard icon={FileText}    label="Ticket promedio"     value={fmtGs(kpis.ticketPromedio)} delta={kpis.ticketDelta} loading={ordersLoading} />
              </>
            )}
          </div>

          {/* Chart row */}
          {(widgets.chart_revenue || widgets.chart_ar) && (
            <div className="mb-[18px] grid gap-4" style={{ gridTemplateColumns: widgets.chart_ar ? '2fr 1fr' : '1fr' }}>
              {widgets.chart_revenue && <RevenueChart months={monthlyRevenue} />}
              {widgets.chart_ar && (
                <ArDonut paid={kpis.cobrado} pending={kpis.pendiente} overdue={kpis.vencido} />
              )}
            </div>
          )}

          {/* Bottom row */}
          <div className={`grid gap-4 ${
            [widgets.stock_critical, widgets.activity, widgets.top_products].filter(Boolean).length === 3 ? 'grid-cols-3' :
            [widgets.stock_critical, widgets.activity, widgets.top_products].filter(Boolean).length === 2 ? 'grid-cols-2' :
            'grid-cols-1'
          }`}>

            {/* Stock crítico */}
            {widgets.stock_critical && (
              <div className="rounded-[15px] border border-border bg-surface shadow-[var(--shadow-sm)]">
                <div className="flex items-center justify-between px-[18px] py-[14px] pb-[10px]">
                  <p className="text-[15px] font-bold text-ink">Stock crítico</p>
                  <Link href="/dashboard/inventory" className="text-[12.5px] font-semibold text-accent-on hover:underline">Ver todo</Link>
                </div>
                <div className="pb-2">
                  {lowStock.length === 0 ? (
                    <p className="px-[18px] py-6 text-center text-[13px] text-faint">
                      {prodLoading ? 'Cargando…' : 'Sin alertas de stock'}
                    </p>
                  ) : (
                    lowStock.map((p) => (
                      <div key={p.id} className="flex cursor-pointer items-center gap-3 mx-2 rounded-[9px] px-[10px] py-[9px] transition-colors hover:bg-surface-2">
                        <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[8px] border border-border bg-surface-2 text-muted">
                          <Box size={15} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13.5px] font-semibold text-ink">{p.name}</p>
                          {p.model && <p className="truncate font-mono text-[11.5px] text-faint">{p.model}</p>}
                        </div>
                        <span className={`shrink-0 rounded-[7px] px-[9px] py-[3px] text-[12px] font-bold ${
                          p.stock === 0 ? 'bg-danger-subtle text-danger' : 'bg-warn-subtle text-warn'
                        }`}>
                          {p.stock === 0 ? 'Agotado' : `${p.stock} u.`}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Actividad reciente */}
            {widgets.activity && (
              <div className="rounded-[15px] border border-border bg-surface shadow-[var(--shadow-sm)]">
                <p className="px-[18px] py-[14px] pb-[10px] text-[15px] font-bold text-ink">Actividad reciente</p>
                <div className="px-[18px] pb-[14px]">
                  {recentLogs.length === 0 ? (
                    <p className="py-6 text-center text-[13px] text-faint">Sin actividad reciente</p>
                  ) : (
                    recentLogs.map((log, idx) => {
                      const action = ACTION_MAP[log.action] ?? log.action;
                      const who    = log.user ? `${log.user.firstName} ${log.user.lastName}` : 'Sistema';
                      const color  = MODULE_COLORS[log.module] ?? '#64748b';
                      return (
                        <div key={log.id} className="flex gap-3 py-[7px]">
                          <div className="flex flex-col items-center">
                            <span
                              className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[8px] text-[11px] font-bold"
                              style={{ background: color + '22', color }}
                            >
                              {log.module.slice(0, 2).toUpperCase()}
                            </span>
                            {idx < recentLogs.length - 1 && <span className="my-[3px] w-px flex-1 bg-border" />}
                          </div>
                          <div className="pb-[6px]">
                            <p className="text-[13px] leading-[1.35] text-ink">{action}</p>
                            <p className="mt-[1px] text-[11.5px] text-faint">{who} · {timeAgo(log.createdAt)}</p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* Top productos */}
            {widgets.top_products && (
              <div className="rounded-[15px] border border-border bg-surface shadow-[var(--shadow-sm)]">
                <p className="px-[18px] py-[14px] pb-[10px] text-[15px] font-bold text-ink">Top productos del mes</p>
                <div className="px-[18px] pb-4">
                  {topProducts.length === 0 ? (
                    <p className="py-6 text-center text-[13px] text-faint">
                      {ordersLoading ? 'Cargando…' : 'Sin ventas registradas'}
                    </p>
                  ) : (
                    topProducts.map((p, i) => (
                      <div key={p.name} className="border-t border-border py-[9px]">
                        <div className="mb-[6px] flex items-center gap-2">
                          <span className="w-[18px] text-[12px] font-bold tabular-nums text-faint">
                            {String(i + 1).padStart(2, '0')}
                          </span>
                          <span className="flex-1 truncate text-[13.5px] font-semibold text-ink">{p.name}</span>
                          <span className="font-mono text-[12px] text-muted">{p.qty} u.</span>
                          <span className="font-mono text-[12.5px] font-bold text-ink">{fmtGs(p.total)}</span>
                        </div>
                        <div className="h-[5px] overflow-hidden rounded-full bg-surface-2">
                          <div
                            className="h-full rounded-full bg-accent"
                            style={{ width: `${Math.round((p.total / topMax) * 100)}%` }}
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Módulos activos (si no hay ventas y está en vista operativo) */}
          {!activeModules.includes('sales') && view === 'operativo' && (
            <div className="mt-6">
              <p className="mb-3 text-[14px] font-semibold text-ink">Módulos disponibles</p>
              <div className="grid grid-cols-3 gap-3">
                {([
                  { key: 'sales',       label: 'Ventas',      href: '/dashboard/sales',       icon: ShoppingCart },
                  { key: 'inventory',   label: 'Inventario',  href: '/dashboard/inventory',   icon: Package },
                  { key: 'billing',     label: 'Facturación', href: '/dashboard/billing',     icon: FileText },
                  { key: 'procurement', label: 'Compras',     href: '/dashboard/procurement', icon: Truck },
                  { key: 'payments',    label: 'Cuentas',     href: '/dashboard/payments',    icon: CreditCard },
                  { key: 'hr',          label: 'RRHH',        href: '/dashboard/hr',          icon: Users },
                ] as const)
                  .filter(({ key }) => activeModules.includes(key))
                  .map(({ label, href, icon: Icon }) => (
                    <Link key={href} href={href} className="flex items-center gap-3 rounded-[13px] border border-border bg-surface p-4 transition-colors hover:border-border-strong hover:shadow-[var(--shadow-sm)]">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] bg-accent-subtle text-accent-on"><Icon size={17} /></span>
                      <span className="flex-1 text-[14px] font-semibold text-ink">{label}</span>
                      <ArrowRight size={15} className="shrink-0 text-faint" />
                    </Link>
                  ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Personalize drawer ─────────────────────────────────────────────── */}
      {showPersonalize && (
        <PersonalizeDrawer
          widgets={widgets}
          onChange={setWidget}
          onClose={() => setShowPersonalize(false)}
        />
      )}
    </div>
  );
}
