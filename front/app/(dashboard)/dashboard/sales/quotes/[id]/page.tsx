'use client';

import { apiErrorMessage } from '@/lib/api/api-error';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Download, ArrowRightCircle, Ban, FileText } from 'lucide-react';
import { salesApi, type Customer } from '../../../../../../lib/api/sales';
import { SearchSelect } from '../../../components/search-select';
import { useAuth } from '../../../../../../lib/auth-context';
import { openPdf } from '../../../../../../lib/open-pdf';
import { formatDatePY } from '../../../../../../lib/date';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  CUSTOMER_PREFILL_KEY,
  NEW_CUSTOMER_ID_KEY,
  customerPrefillFrom,
  isProspectOrder,
  orderPartyDocument,
  orderPartyName,
} from '@/lib/quote-party';

function formatPrice(n: number) {
  return new Intl.NumberFormat('es-PY', { style: 'currency', currency: 'PYG', maximumFractionDigits: 0 }).format(n);
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
    mutationFn: () => salesApi.convertQuote(id, convertCustomerId || undefined),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['sale-order', id] });
      void qc.invalidateQueries({ queryKey: ['sale-orders'] });
      // Los pedidos no tienen página de detalle propia (se abren en un panel
      // de Órdenes de venta): el convertido aparece primero en esa lista.
      router.push('/dashboard/sales');
    },
  });

  // El PDF se genera al crear el presupuesto; si esa generación falló, se
  // puede pedir de nuevo desde acá.
  const pdfMutation = useMutation({
    mutationFn: () => salesApi.retryQuotePdf(id),
    onSuccess: (updated) => {
      qc.setQueryData(['sale-order', id], updated);
      if (updated.quotePdfFileId) void openPdf(updated.quotePdfFileId);
    },
  });

  // Para convertir un presupuesto hecho sin cliente registrado.
  const [convertCustomerId, setConvertCustomerId] = useState('');
  const [choosingCustomer, setChoosingCustomer] = useState(false);
  const { data: customers = [] } = useQuery({
    queryKey: ['sale-customers'],
    queryFn: salesApi.listCustomers,
    enabled: canManage && choosingCustomer,
  });

  // Al volver de registrar al cliente, queda elegido para convertir.
  useEffect(() => {
    const newCustomerId = sessionStorage.getItem(NEW_CUSTOMER_ID_KEY);
    if (!newCustomerId) return;
    sessionStorage.removeItem(NEW_CUSTOMER_ID_KEY);
    // Lectura de sessionStorage al montar: es sincronizar con un sistema
    // externo (no derivable en el render, que también corre en el servidor).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConvertCustomerId(newCustomerId);
    setChoosingCustomer(true);
  }, []);

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
  const isProspect = isProspectOrder(quote);
  const partyDocument = orderPartyDocument(quote);

  // El alta de cliente arranca con lo que ya se cargó en el presupuesto y
  // vuelve acá con el cliente nuevo elegido.
  function registerCustomer() {
    sessionStorage.setItem(CUSTOMER_PREFILL_KEY, JSON.stringify(customerPrefillFrom(quote!)));
    router.push(`/dashboard/sales/customers/new?returnTo=/dashboard/sales/quotes/${id}`);
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.push('/dashboard/sales/quotes')}>
          <ArrowLeft size={18} />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold text-foreground font-mono">{quote.quoteNumber ?? '—'}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{formatDatePY(quote.orderDate, 'local')}</p>
        </div>
        <Badge variant="outline" className={isQuoted ? 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-800' : ''}>
          {isQuoted ? 'Presupuesto' : quote.status === 'CANCELLED' ? 'Cancelado' : quote.status}
        </Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-6">
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-1">Cliente</p>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-foreground">{orderPartyName(quote)}</p>
            {isProspect && <Badge variant="outline">Sin registrar como cliente</Badge>}
          </div>
          {partyDocument && <p className="text-xs text-muted-foreground">{partyDocument}</p>}
          {isProspect && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {[quote.prospectPhone, quote.prospectEmail, quote.prospectAddress].filter(Boolean).join(' · ')}
            </p>
          )}
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

      {isQuoted && canManage && isProspect && choosingCustomer && (
        <div className="space-y-3 rounded-xl border border-border bg-card p-5">
          <div>
            <p className="text-sm font-medium text-foreground">
              Registrá a {quote.prospectName} como cliente para convertirlo en pedido
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Un pedido termina en factura y cuenta por cobrar, así que necesita un cliente registrado.
            </p>
          </div>
          <Button variant="outline" onClick={registerCustomer}>
            Registrar como cliente nuevo
          </Button>
          <div>
            <Label className="mb-1 text-xs">O elegí un cliente que ya existe</Label>
            <SearchSelect<Customer>
              items={customers}
              value={convertCustomerId}
              onChange={(customerId) => setConvertCustomerId(customerId)}
              getKey={(c) => c.id}
              getLabel={(c) => `${c.firstName} ${c.lastName}`}
              getDescription={(c) => [c.documentNumber ?? null, c.phone ?? null].filter(Boolean).join(' · ') || null}
              filterFn={(c, q) => `${c.firstName} ${c.lastName} ${c.documentNumber ?? ''} ${c.customerCode ?? ''}`.toLowerCase().includes(q.toLowerCase())}
              placeholder="Buscar cliente..."
              emptyMessage="No se encontró."
            />
          </div>
          {convertCustomerId && (
            <p role="status" className="text-xs text-muted-foreground">
              Cliente elegido. Tocá «Convertir a pedido» para terminar.
            </p>
          )}
        </div>
      )}

      </div>

      {/* Total y acciones, siempre a la vista */}
      <div className="lg:sticky lg:top-6 lg:self-start">
      <div className="space-y-3 rounded-xl border border-border bg-card p-5">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Total</p>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-foreground">{formatPrice(total)}</p>
        </div>
        {(convertMutation.isError || cancelMutation.isError || pdfMutation.isError) && (
          <p role="alert" className="text-sm text-destructive">
            {apiErrorMessage((convertMutation.error ?? cancelMutation.error ?? pdfMutation.error), 'Ocurrió un error')}
          </p>
        )}
      <div className="flex flex-col gap-2 [&>button]:w-full">
        {quote.quotePdfFileId && (
          <Button variant="outline" className="gap-1.5" onClick={() => void openPdf(quote.quotePdfFileId!)}>
            <Download size={15} /> Descargar PDF
          </Button>
        )}
        {!quote.quotePdfFileId && quote.orderType === 'QUOTE' && canManage && (
          <Button
            variant="outline"
            className="gap-1.5"
            disabled={pdfMutation.isPending}
            onClick={() => pdfMutation.mutate()}
          >
            <FileText size={15} /> {pdfMutation.isPending ? 'Generando PDF...' : 'Generar PDF'}
          </Button>
        )}
        {isQuoted && canManage && (
          <>
            <Button
              className="gap-1.5"
              disabled={convertMutation.isPending}
              onClick={() => {
                // Sin cliente registrado no hay pedido: primero se elige uno.
                if (isProspect && !convertCustomerId) setChoosingCustomer(true);
                else convertMutation.mutate();
              }}
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
      </div>
      </div>
    </div>
  );
}
