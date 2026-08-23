'use client';

import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Download, ArrowRightCircle, Ban } from 'lucide-react';
import { salesApi } from '../../../../../../lib/api/sales';
import { useAuth } from '../../../../../../lib/auth-context';
import { openPdf } from '../../../../../../lib/open-pdf';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

function formatPrice(n: number) {
  return new Intl.NumberFormat('es-PY', { style: 'currency', currency: 'PYG', maximumFractionDigits: 0 }).format(n);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-PY', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export default function QuoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { jwtPayload } = useAuth();
  const canRead = jwtPayload?.permissions.includes('sales:quotes:read') ?? false;
  const canManage = jwtPayload?.permissions.includes('sales:quotes:manage') ?? false;

  const { data: quote, isLoading } = useQuery({
    queryKey: ['sale-order', id],
    queryFn: () => salesApi.getOrder(id),
    enabled: canRead,
  });

  const convertMutation = useMutation({
    mutationFn: () => salesApi.convertQuote(id),
    onSuccess: (updated) => {
      void qc.invalidateQueries({ queryKey: ['sale-order', id] });
      void qc.invalidateQueries({ queryKey: ['sale-orders'] });
      router.push(`/dashboard/sales/${updated.id}`);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => salesApi.cancelOrder(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['sale-order', id] });
      void qc.invalidateQueries({ queryKey: ['sale-orders'] });
    },
  });

  if (!canRead) {
    return (
      <div className="py-24 text-center">
        <p className="text-sm text-muted-foreground/60">No tenés permisos para acceder a esta sección.</p>
      </div>
    );
  }
  if (isLoading) {
    return <div className="py-16 text-center text-sm text-muted-foreground/60">Cargando...</div>;
  }
  if (!quote) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-muted-foreground/60">Presupuesto no encontrado.</p>
      </div>
    );
  }

  const total = quote.items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  const isQuoted = quote.status === 'QUOTED';

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.push('/dashboard/sales/quotes')}>
          <ArrowLeft size={18} />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold text-foreground font-mono">{quote.quoteNumber ?? '—'}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{formatDate(quote.orderDate)}</p>
        </div>
        <Badge variant="outline" className={isQuoted ? 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-800' : ''}>
          {isQuoted ? 'Presupuesto' : quote.status === 'CANCELLED' ? 'Cancelado' : quote.status}
        </Badge>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-1">Cliente</p>
          <p className="text-sm text-foreground">{quote.customer.firstName} {quote.customer.lastName}</p>
          {quote.customer.documentNumber && <p className="text-xs text-muted-foreground">{quote.customer.documentType}: {quote.customer.documentNumber}</p>}
        </div>

        <div className="px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">Ítems</p>
          <div className="space-y-3">
            {quote.items.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground">{item.product?.name ?? item.description ?? 'Ítem'}</p>
                  {item.specNotes && <p className="text-xs text-muted-foreground whitespace-pre-line mt-0.5">{item.specNotes}</p>}
                  <p className="text-xs text-muted-foreground/60 mt-0.5">{item.quantity} × {formatPrice(item.unitPrice)}</p>
                </div>
                <p className="text-sm font-medium text-foreground shrink-0">{formatPrice(item.quantity * item.unitPrice)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-border px-5 py-4 bg-muted/10">
          <span className="text-sm font-medium text-muted-foreground">Total</span>
          <span className="text-lg font-semibold text-foreground">{formatPrice(total)}</span>
        </div>
      </div>

      {(convertMutation.isError || cancelMutation.isError) && (
        <p className="mt-3 text-sm text-destructive">
          {((convertMutation.error ?? cancelMutation.error) as Error & { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Ocurrió un error'}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {quote.quotePdfFileId && (
          <Button variant="outline" className="gap-1.5" onClick={() => void openPdf(quote.quotePdfFileId!)}>
            <Download size={15} /> Descargar PDF
          </Button>
        )}
        {isQuoted && canManage && (
          <>
            <Button
              className="gap-1.5"
              disabled={convertMutation.isPending}
              onClick={() => convertMutation.mutate()}
            >
              <ArrowRightCircle size={15} /> {convertMutation.isPending ? 'Convirtiendo...' : 'Convertir a pedido'}
            </Button>
            <Button
              variant="outline"
              className="gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10"
              disabled={cancelMutation.isPending}
              onClick={() => { if (confirm('¿Cancelar este presupuesto?')) cancelMutation.mutate(); }}
            >
              <Ban size={15} /> Cancelar
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
