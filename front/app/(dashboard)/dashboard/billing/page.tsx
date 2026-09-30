'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { billingApi, type CreditNote, type InvoiceStatus } from '../../../../lib/api/billing';
import { formatDatePY } from '../../../../lib/date';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { cn } from '@/lib/utils';

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatPrice(n: number) {
  return new Intl.NumberFormat('es-PY', { style: 'currency', currency: 'PYG', maximumFractionDigits: 0 }).format(n);
}


// ── Status badge ───────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  PENDING:   'Borrador',
  ISSUED:    'Emitida',
  PAID:      'Pagada',
  CANCELLED: 'Cancelada',
};

const STATUS_CLASS: Partial<Record<InvoiceStatus, string>> = {
  PENDING: 'bg-warn-subtle text-warn border-warn/30',
  ISSUED:  'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800',
  PAID:    'bg-accent-subtle text-accent-on border-accent-on/20',
};

function StatusBadge({ status }: { status: InvoiceStatus }) {
  return (
    <Badge variant={status === 'CANCELLED' ? 'destructive' : 'outline'} className={STATUS_CLASS[status]}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

// ── Credit notes tab ───────────────────────────────────────────────────────────

function CreditNotesTab() {
  const { data: notes = [], isLoading } = useQuery({ queryKey: ['credit-notes'], queryFn: billingApi.listCreditNotes });
  if (isLoading) return <div className="py-16 text-center text-sm text-muted-foreground">Cargando...</div>;
  if (notes.length === 0) return <div className="py-16 text-center"><p className="text-sm text-muted-foreground">No hay notas de crédito emitidas.</p></div>;

  return (
    <Card className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/30 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">N° Nota</th>
              <th className="px-4 py-3 text-left">Cliente</th>
              <th className="px-4 py-3 text-left">Motivo</th>
              <th className="px-4 py-3 text-left">Fecha</th>
              <th className="px-4 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {notes.map((note: CreditNote) => (
              <tr key={note.id} className="hover:bg-muted/20 transition-colors">
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{note.number ?? `NC-${note.id.slice(0, 6).toUpperCase()}`}</td>
                <td className="px-4 py-3">
                  <div className="font-medium text-foreground">{note.invoice.saleOrder.customer.firstName} {note.invoice.saleOrder.customer.lastName}</div>
                  {note.invoice.saleOrder.customer.email && <div className="text-xs text-muted-foreground">{note.invoice.saleOrder.customer.email}</div>}
                </td>
                <td className="px-4 py-3 text-muted-foreground max-w-xs truncate">{note.reason}</td>
                <td className="px-4 py-3 text-muted-foreground">{formatDatePY(note.issuedAt, 'local')}</td>
                <td className="px-4 py-3 text-right font-mono font-medium text-foreground">{formatPrice(Number(note.total))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

type Tab = 'invoices' | 'credit-notes';

export default function BillingPage() {
  const router = useRouter();
  const [tab, setTab]               = useState<Tab>('invoices');
  const [statusFilter, setStatusFilter] = useState<'' | InvoiceStatus>('');
  const [search, setSearch]         = useState('');

  const { data: invoices = [], isLoading } = useQuery({ queryKey: ['invoices'], queryFn: billingApi.listInvoices });

  const filtered = invoices.filter((inv) => {
    const name = `${inv.saleOrder.customer.firstName} ${inv.saleOrder.customer.lastName}`.toLowerCase();
    return (!search || name.includes(search.toLowerCase()) || inv.id.startsWith(search.toLowerCase()))
      && (!statusFilter || inv.status === statusFilter);
  });

  const pendingCount = invoices.filter((inv) => inv.status === 'PENDING').length;

  return (
    <div>
      {/* Header */}
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="text-[25px] font-extrabold tracking-tight text-foreground">Facturas</h1>
          <p className="mt-1 text-[14px] text-muted-foreground">Al confirmar un pedido se genera un borrador. El cajero lo revisa y lo emite.</p>
        </div>
        {pendingCount > 0 && (
          <Badge className="mt-1 bg-warn-subtle text-warn border-warn/30 px-3 py-1">
            {pendingCount} borrador{pendingCount > 1 ? 'es' : ''} pendiente{pendingCount > 1 ? 's' : ''}
          </Badge>
        )}
      </div>

      {/* Tabs */}
      <div className="mb-5 flex border-b border-border gap-1">
        {(['invoices', 'credit-notes'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              '-mb-px border-b-2 px-4 py-2.5 text-[13.5px] font-medium transition-colors',
              tab === t ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t === 'invoices' ? 'Facturas' : 'Notas de crédito'}
          </button>
        ))}
      </div>

      {tab === 'credit-notes' ? (
        <CreditNotesTab />
      ) : (
        <>
          {/* Filters */}
          <div className="mb-4 flex items-center gap-3">
            <div className="relative flex-1 min-w-48">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
              <Input className="pl-8" placeholder="Buscar por cliente..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={statusFilter || 'all'} onValueChange={(v) => setStatusFilter(v === 'all' ? '' : v as InvoiceStatus)}>
              <SelectTrigger>
                <span className="min-w-0 flex-1 truncate text-left text-sm">
                  {statusFilter ? STATUS_LABEL[statusFilter as InvoiceStatus] : 'Todos los estados'}
                </span>
              </SelectTrigger>
              <SelectContent className="w-auto min-w-[9rem]">
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="PENDING">Borrador</SelectItem>
                <SelectItem value="ISSUED">Emitida</SelectItem>
                <SelectItem value="PAID">Pagada</SelectItem>
                <SelectItem value="CANCELLED">Cancelada</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="py-16 text-center text-sm text-muted-foreground">Cargando facturas...</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-sm text-muted-foreground">
                {invoices.length === 0 ? 'Aún no hay facturas. Se generan al confirmar un pedido de venta.' : 'No se encontraron facturas con los filtros aplicados.'}
              </p>
            </div>
          ) : (
            <Card className="overflow-hidden p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-border bg-muted/30 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 text-left">N° Factura</th>
                      <th className="px-4 py-3 text-left">Cliente</th>
                      <th className="px-4 py-3 text-left hidden sm:table-cell">Tipo</th>
                      <th className="px-4 py-3 text-left">Fecha</th>
                      <th className="px-4 py-3 text-left">Estado</th>
                      <th className="px-4 py-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filtered.map((invoice) => (
                      <tr
                        key={invoice.id}
                        onClick={() => router.push(`/dashboard/billing/invoices/${invoice.id}`)}
                        className="cursor-pointer hover:bg-muted/20 transition-colors"
                      >
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                          {invoice.invoiceNumber ? `${invoice.invoicePrefix ?? ''}${invoice.invoiceNumber}` : `#${invoice.id.slice(0, 8).toUpperCase()}`}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-foreground">{invoice.saleOrder.customer.firstName} {invoice.saleOrder.customer.lastName}</div>
                          {invoice.saleOrder.customer.email && <div className="text-xs text-muted-foreground">{invoice.saleOrder.customer.email}</div>}
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground text-xs">
                          {invoice.saleOrder.saleType === 'CREDIT' ? `Crédito${invoice.saleOrder.installments ? ` · ${invoice.saleOrder.installments}c` : ''}` : 'Contado'}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{formatDatePY(invoice.issuedAt ?? invoice.createdAt, 'local')}</td>
                        <td className="px-4 py-3"><StatusBadge status={invoice.status} /></td>
                        <td className="px-4 py-3 text-right font-mono font-medium text-foreground">{formatPrice(Number(invoice.total))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
