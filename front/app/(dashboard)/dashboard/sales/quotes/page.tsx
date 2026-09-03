'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { FileText, Plus } from 'lucide-react';
import { salesApi, type SaleOrderStatus } from '../../../../../lib/api/sales';
import { useAuth } from '../../../../../lib/auth-context';
import { formatDatePY } from '../../../../../lib/date';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

function formatPrice(n: number) {
  return new Intl.NumberFormat('es-PY', { style: 'currency', currency: 'PYG', maximumFractionDigits: 0 }).format(n);
}


function quoteTotal(items: { unitPrice: number; quantity: number }[]) {
  return items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
}

const STATUS_LABEL: Partial<Record<SaleOrderStatus, string>> = {
  QUOTED: 'Presupuesto',
  CANCELLED: 'Cancelado',
};

export default function QuotesPage() {
  const { jwtPayload } = useAuth();
  const canRead = jwtPayload?.permissions.includes('sales:quotes:read') ?? false;
  const canCreate = jwtPayload?.permissions.includes('sales:quotes:manage') ?? false;

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['sale-orders'],
    queryFn: salesApi.listOrders,
    enabled: canRead,
  });

  if (!canRead) {
    return (
      <div className="py-24 text-center">
        <p className="text-sm text-muted-foreground/60">No tenés permisos para acceder a esta sección.</p>
      </div>
    );
  }

  const quotes = orders
    .filter((o) => o.orderType === 'QUOTE')
    .sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime());

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Presupuestos</h1>
          <p className="mt-1 text-sm text-muted-foreground">Cotizaciones para clientes — no comprometen stock hasta convertirse en pedido.</p>
        </div>
        {canCreate && (
          <Link href="/dashboard/sales/quotes/new">
            <Button className="gap-1.5"><Plus size={16} /> Nuevo presupuesto</Button>
          </Link>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-muted/30" />)}
        </div>
      ) : quotes.length === 0 ? (
        <div className="py-24 text-center">
          <FileText size={28} className="mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground/60">Todavía no hay presupuestos.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {quotes.map((q) => (
            <Link
              key={q.id}
              href={`/dashboard/sales/quotes/${q.id}`}
              className="flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-3 hover:border-ring/50 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground font-mono">{q.quoteNumber ?? '—'}</p>
                <p className="text-xs text-muted-foreground/60 mt-0.5">{q.customer.firstName} {q.customer.lastName} · {formatDatePY(q.orderDate, 'local')}</p>
              </div>
              <Badge variant="outline" className={q.status === 'CANCELLED' ? '' : 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-800'}>
                {STATUS_LABEL[q.status] ?? q.status}
              </Badge>
              <p className="text-sm font-medium text-foreground tabular-nums w-32 text-right">{formatPrice(quoteTotal(q.items))}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
