'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowDown, CheckCircle, Clock, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { reportsApi } from '../../../../../lib/api/reports';
import { daysOverdue } from '../../../../../lib/overdue';
import { cn } from '@/lib/utils';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat('es-PY', { style: 'currency', currency: 'PYG', maximumFractionDigits: 0 }).format(n);
}

function fmtDate(s: string | null) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
}

// ── Shared components ─────────────────────────────────────────────────────────

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground/60">{sub}</p>}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="py-10 text-center text-sm text-muted-foreground/60">{text}</p>;
}

// ── Ventas tab ────────────────────────────────────────────────────────────────

function SalesTab() {
  const today = new Date();
  const firstDay = `${today.getFullYear()}-01-01`;
  const lastDay = today.toISOString().slice(0, 10);

  const [dateFrom, setDateFrom] = useState(firstDay);
  const [dateTo, setDateTo] = useState(lastDay);

  const { data, isLoading } = useQuery({
    queryKey: ['reports-sales', dateFrom, dateTo],
    queryFn: () => reportsApi.getSales(dateFrom, dateTo),
  });

  const inputCls = 'rounded-lg border border-border bg-card text-foreground px-3 py-1.5 text-sm focus:border-ring focus:outline-none';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Desde</span>
          <input type="date" className={inputCls} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Hasta</span>
          <input type="date" className={inputCls} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
      </div>

      {isLoading ? (
        <EmptyState text="Cargando reporte de ventas…" />
      ) : !data ? (
        <EmptyState text="No hay datos para el período seleccionado" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <KpiCard label="Ingresos totales" value={fmt(data.summary.totalRevenue)} />
            <KpiCard label="Órdenes" value={String(data.summary.ordersCount)} sub={`${data.summary.confirmedCount} confirmadas · ${data.summary.invoicedCount} facturadas`} />
            <KpiCard label="Ticket promedio" value={fmt(data.summary.avgOrderValue)} />
            <KpiCard label="Facturadas" value={String(data.summary.invoicedCount)} />
          </div>

          {data.byMonth.length > 0 && (
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="px-5 py-3 border-b border-border">
                <h3 className="text-sm font-medium text-muted-foreground">Ingresos por mes</h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wide">
                    <th className="px-5 py-3 text-left font-medium">Mes</th>
                    <th className="px-5 py-3 text-right font-medium">Ingresos</th>
                    <th className="px-5 py-3 text-right font-medium">Órdenes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.byMonth.map((row) => (
                    <tr key={row.month} className="hover:bg-muted/20">
                      <td className="px-5 py-3 text-muted-foreground">{row.month}</td>
                      <td className="px-5 py-3 text-right font-medium text-foreground">{fmt(row.revenue)}</td>
                      <td className="px-5 py-3 text-right text-muted-foreground">{row.orders}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data.topProducts.length > 0 && (
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="px-5 py-3 border-b border-border">
                <h3 className="text-sm font-medium text-muted-foreground">Top 10 productos por ingresos</h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wide">
                    <th className="px-5 py-3 text-left font-medium">#</th>
                    <th className="px-5 py-3 text-left font-medium">Producto</th>
                    <th className="px-5 py-3 text-right font-medium">Cantidad</th>
                    <th className="px-5 py-3 text-right font-medium">Ingresos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.topProducts.map((p, i) => (
                    <tr key={p.name} className="hover:bg-muted/20">
                      <td className="px-5 py-3 text-muted-foreground/60 tabular-nums">{i + 1}</td>
                      <td className="px-5 py-3 text-muted-foreground">{p.name}</td>
                      <td className="px-5 py-3 text-right text-muted-foreground">{p.quantity}</td>
                      <td className="px-5 py-3 text-right font-medium text-foreground">{fmt(p.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Stock tab ─────────────────────────────────────────────────────────────────

function StockTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['reports-stock'],
    queryFn: reportsApi.getStock,
  });

  return (
    <div className="space-y-6">
      {isLoading ? (
        <EmptyState text="Cargando reporte de stock…" />
      ) : !data ? (
        <EmptyState text="No hay datos de stock disponibles" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <KpiCard label="Total productos" value={String(data.summary.totalProducts)} />
            <KpiCard label="Valor en stock" value={fmt(data.summary.totalStockValue)} />
            <KpiCard label="Stock bajo" value={String(data.summary.lowStock)} />
            <KpiCard label="Sin stock" value={String(data.summary.outOfStock)} />
          </div>

          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="px-5 py-3 border-b border-border">
              <h3 className="text-sm font-medium text-muted-foreground">Inventario actual</h3>
            </div>
            {data.products.length === 0 ? (
              <EmptyState text="Sin productos" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[700px]">
                  <thead>
                    <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wide">
                      <th className="px-5 py-3 text-left font-medium">Producto</th>
                      <th className="px-5 py-3 text-left font-medium">Categoría</th>
                      <th className="px-5 py-3 text-right font-medium">Stock</th>
                      <th className="px-5 py-3 text-right font-medium">Precio venta</th>
                      <th className="px-5 py-3 text-right font-medium">Valor total</th>
                      <th className="px-5 py-3 text-center font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.products.map((p) => {
                      const isOut = p.stock <= 0;
                      const isLow = p.stock > 0 && p.stock <= 5;
                      return (
                        <tr key={p.id} className="hover:bg-muted/20">
                          <td className="px-5 py-3">
                            <p className="font-medium text-foreground">{p.name}</p>
                            {p.model && <p className="text-xs text-muted-foreground/60">{p.model}</p>}
                          </td>
                          <td className="px-5 py-3 text-muted-foreground">{p.category}</td>
                          <td className={`px-5 py-3 text-right font-semibold tabular-nums ${isOut ? 'text-destructive' : isLow ? 'text-amber-600' : 'text-foreground'}`}>
                            {p.stock}
                          </td>
                          <td className="px-5 py-3 text-right text-muted-foreground">{fmt(p.salePrice)}</td>
                          <td className="px-5 py-3 text-right text-muted-foreground">{fmt(p.stockValue)}</td>
                          <td className="px-5 py-3 text-center">
                            {isOut ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                                <ArrowDown size={10} /> Sin stock
                              </span>
                            ) : isLow ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                                <AlertTriangle size={10} /> Bajo
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                                <CheckCircle size={10} /> OK
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Cuentas por cobrar tab ────────────────────────────────────────────────────

function ReceivablesTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['reports-receivables'],
    queryFn: reportsApi.getReceivables,
  });

  const statusLabel: Record<string, string> = {
    PENDING: 'Pendiente',
    PARTIALLY_PAID: 'Parcial',
    PAID: 'Pagado',
    OVERDUE: 'Vencida',
  };

  const statusCls: Record<string, string> = {
    PENDING: 'bg-warn-subtle text-warn',
    PARTIALLY_PAID: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400',
    PAID: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
    OVERDUE: 'bg-destructive/10 text-destructive',
  };

  return (
    <div className="space-y-6">
      {isLoading ? (
        <EmptyState text="Cargando cuentas por cobrar…" />
      ) : !data ? (
        <EmptyState text="No hay datos disponibles" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <KpiCard label="Pendiente" value={fmt(data.summary.totalPending)} />
            <KpiCard label="Vencido" value={fmt(data.summary.totalOverdue)} />
            <KpiCard label="Cobrado" value={fmt(data.summary.totalCollected)} />
            <KpiCard label="Total cuentas" value={String(data.summary.totalItems)} />
          </div>

          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="px-5 py-3 border-b border-border">
              <h3 className="text-sm font-medium text-muted-foreground">Cuentas por cobrar</h3>
            </div>
            {data.items.length === 0 ? (
              <EmptyState text="Sin cuentas registradas" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[680px]">
                  <thead>
                    <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wide">
                      <th className="px-5 py-3 text-left font-medium">Cliente</th>
                      <th className="px-5 py-3 text-right font-medium">Total</th>
                      <th className="px-5 py-3 text-right font-medium">Cobrado</th>
                      <th className="px-5 py-3 text-right font-medium">Pendiente</th>
                      <th className="px-5 py-3 text-center font-medium">Vencimiento</th>
                      <th className="px-5 py-3 text-center font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.items.map((item) => {
                      const overdueDays = item.isOverdue && item.dueDate ? Math.max(0, daysOverdue(item.dueDate)) : 0;
                      const dueSoonDays = item.isDueSoon && item.dueDate ? Math.max(0, -daysOverdue(item.dueDate)) : 0;
                      // Mismo diseño de resaltado (barra + fila teñida + fecha
                      // coloreada) que payments/page.tsx y finance/page.tsx.
                      // Al contado, "Pendiente" ya es la señal (como
                      // siempre); a crédito, isOverdue/isDueSoon ya vienen
                      // calculados por el backend sobre la cuota real más
                      // próxima sin pagar, no sobre el AR.dueDate estático
                      // — un crédito "Pendiente" sin fecha próxima no lleva
                      // acento, evita marcar como urgente una cuenta al día.
                      const accent = item.isOverdue
                        ? 'destructive'
                        : item.isDueSoon || (item.saleType === 'CASH' && item.status === 'PENDING')
                          ? 'warn'
                          : null;
                      return (
                        <tr
                          key={item.id}
                          className={cn(
                            'hover:bg-muted/20',
                            accent === 'destructive' && 'bg-destructive/5',
                            accent === 'warn' && 'bg-warn-subtle/40',
                          )}
                        >
                          <td
                            className={cn(
                              'px-5 py-3 text-muted-foreground font-medium',
                              accent === 'destructive' && 'border-l-[3px] border-l-destructive',
                              accent === 'warn' && 'border-l-[3px] border-l-warn',
                            )}
                          >
                            {item.customer}
                          </td>
                          <td className="px-5 py-3 text-right text-muted-foreground">{fmt(item.amount)}</td>
                          <td className="px-5 py-3 text-right text-emerald-700 dark:text-emerald-400">{fmt(item.paidAmount)}</td>
                          <td className="px-5 py-3 text-right font-semibold text-foreground">{fmt(item.pending)}</td>
                          <td className="px-5 py-3 text-center">
                            {item.dueDate ? (
                              <span
                                className={cn(
                                  'flex items-center justify-center gap-1 text-xs',
                                  accent === 'destructive' && 'text-destructive font-medium',
                                  accent === 'warn' && 'text-warn font-medium',
                                  !accent && 'text-muted-foreground',
                                )}
                              >
                                {item.isOverdue && <Clock size={11} />}
                                {fmtDate(item.dueDate)}
                              </span>
                            ) : '—'}
                          </td>
                          <td className="px-5 py-3 text-center">
                            {item.isOverdue ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive">
                                <AlertTriangle size={10} />
                                Vencida · {overdueDays} {overdueDays === 1 ? 'día' : 'días'}
                              </span>
                            ) : item.isDueSoon ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-warn-subtle px-2.5 py-0.5 text-xs font-medium text-warn">
                                <Clock size={10} />
                                Vence en {dueSoonDays} {dueSoonDays === 1 ? 'día' : 'días'}
                              </span>
                            ) : (
                              <span className={cn('inline-block rounded-full px-2.5 py-0.5 text-xs font-medium', statusCls[item.status] ?? 'bg-muted/30 text-muted-foreground')}>
                                {statusLabel[item.status] ?? item.status}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type Tab = 'sales' | 'stock' | 'receivables';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'sales', label: 'Ventas', icon: TrendingUp },
  { id: 'stock', label: 'Stock', icon: AlertTriangle },
  { id: 'receivables', label: 'Cuentas por cobrar', icon: Clock },
];

export default function ReportsPage() {
  const [active, setActive] = useState<Tab>('sales');

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Reportes</h1>
        <p className="mt-1 text-sm text-muted-foreground">Visualizá métricas clave de tu negocio</p>
      </div>

      <div className="flex border-b border-border mb-6">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActive(id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              active === id
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {active === 'sales' && <SalesTab />}
      {active === 'stock' && <StockTab />}
      {active === 'receivables' && <ReceivablesTab />}
    </div>
  );
}
