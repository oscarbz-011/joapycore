'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { billingApi, type CreditNote, type InvoiceStatus } from '../../../../lib/api/billing';
import { formatDatePY } from '../../../../lib/date';
import {
  compareFiscalOrder,
  filterInvoiceRows,
  toInvoiceRows,
  type InvoiceKind,
  type InvoiceRow,
} from '../../../../lib/invoice-rows';
import { openPdf } from '../../../../lib/open-pdf';
import { useTableSort } from '../../../../lib/use-table-sort';
import { SortableHeader } from '@/components/sortable-header';
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

// ── Ordenamiento por columna ───────────────────────────────────────────────────

const INVOICE_SORT = {
  number: (row: InvoiceRow) => row.fiscalNumber,
  customer: (row: InvoiceRow) => row.customerName,
  type: (row: InvoiceRow) => row.typeLabel,
  date: (row: InvoiceRow) => new Date(row.date),
  status: (row: InvoiceRow) => STATUS_LABEL[row.status],
  total: (row: InvoiceRow) => row.total,
};

const creditNoteCustomer = (note: CreditNote) =>
  `${note.invoice.saleOrder.customer.firstName} ${note.invoice.saleOrder.customer.lastName}`;

const CREDIT_NOTE_SORT = {
  number: (note: CreditNote) => note.number,
  customer: creditNoteCustomer,
  reason: (note: CreditNote) => note.reason,
  date: (note: CreditNote) => new Date(note.issuedAt),
  total: (note: CreditNote) => Number(note.total),
};

// ── Credit notes tab ───────────────────────────────────────────────────────────

function CreditNotesTab() {
  const { data: notes = [], isLoading } = useQuery({ queryKey: ['credit-notes'], queryFn: billingApi.listCreditNotes });
  const { sorted, sort, toggle } = useTableSort(notes, CREDIT_NOTE_SORT);
  if (isLoading) return <div className="py-16 text-center text-sm text-muted-foreground">Cargando...</div>;
  if (notes.length === 0) return <div className="py-16 text-center"><p className="text-sm text-muted-foreground">No hay notas de crédito emitidas.</p></div>;

  return (
    <Card className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/30 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <tr>
              <SortableHeader label="N° Nota" sortKey="number" sort={sort} onSort={toggle} />
              <SortableHeader label="Cliente" sortKey="customer" sort={sort} onSort={toggle} />
              <SortableHeader label="Motivo" sortKey="reason" sort={sort} onSort={toggle} />
              <SortableHeader label="Fecha" sortKey="date" sort={sort} onSort={toggle} />
              <SortableHeader label="Total" sortKey="total" sort={sort} onSort={toggle} align="right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorted.map((note: CreditNote) => (
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
  const [kindFilter, setKindFilter] = useState<'' | InvoiceKind>('');
  const [openError, setOpenError]   = useState('');

  const { data: invoices = [], isLoading } = useQuery({ queryKey: ['invoices'], queryFn: billingApi.listInvoices });
  // Las facturas de intereses moratorios no tienen pedido de venta: llegan
  // por su propia consulta y se muestran en la misma tabla.
  const { data: interestInvoices = [], isLoading: loadingInterest } = useQuery({
    queryKey: ['invoices', 'interest'],
    queryFn: billingApi.listInterestInvoices,
  });

  const rows = toInvoiceRows(invoices, interestInvoices);
  const filtered = filterInvoiceRows(rows, { search, status: statusFilter, kind: kindFilter });
  // Sin columna elegida, orden fiscal (por número de factura).
  const { sorted, sort, toggle } = useTableSort(filtered, INVOICE_SORT, compareFiscalOrder);

  async function openRow(row: InvoiceRow) {
    setOpenError('');
    if (row.kind === 'SALE') return router.push(`/dashboard/billing/invoices/${row.id}`);
    if (!row.pdfFileId) {
      return setOpenError(
        `La factura de intereses ${row.number} no tiene PDF. Generalo desde el recibo de la cuota (botón "Factura int.").`,
      );
    }
    try {
      await openPdf(row.pdfFileId);
    } catch {
      setOpenError(`No se pudo abrir el PDF de la factura ${row.number}.`);
    }
  }

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
              <Input className="pl-8" placeholder="Buscar por cliente o número..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={kindFilter || 'all'} onValueChange={(v) => setKindFilter(v === 'all' ? '' : v as InvoiceKind)}>
              <SelectTrigger>
                <span className="min-w-0 flex-1 truncate text-left text-sm">
                  {kindFilter === 'SALE' ? 'Venta' : kindFilter === 'INTEREST' ? 'Intereses' : 'Todos los tipos'}
                </span>
              </SelectTrigger>
              <SelectContent className="w-auto min-w-[9rem]">
                <SelectItem value="all">Todos los tipos</SelectItem>
                <SelectItem value="SALE">Venta</SelectItem>
                <SelectItem value="INTEREST">Intereses</SelectItem>
              </SelectContent>
            </Select>
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

          {openError && (
            <p role="alert" className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
              {openError}
            </p>
          )}

          {/* Table */}
          {isLoading || loadingInterest ? (
            <div className="py-16 text-center text-sm text-muted-foreground">Cargando facturas...</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-sm text-muted-foreground">
                {rows.length === 0 ? 'Aún no hay facturas. Se generan al confirmar un pedido de venta.' : 'No se encontraron facturas con los filtros aplicados.'}
              </p>
            </div>
          ) : (
            <Card className="overflow-hidden p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-border bg-muted/30 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <SortableHeader label="N° Factura" sortKey="number" sort={sort} onSort={toggle} />
                      <SortableHeader label="Cliente" sortKey="customer" sort={sort} onSort={toggle} />
                      <SortableHeader label="Tipo" sortKey="type" sort={sort} onSort={toggle} className="hidden sm:table-cell" />
                      <SortableHeader label="Fecha" sortKey="date" sort={sort} onSort={toggle} />
                      <SortableHeader label="Estado" sortKey="status" sort={sort} onSort={toggle} />
                      <SortableHeader label="Total" sortKey="total" sort={sort} onSort={toggle} align="right" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {sorted.map((row) => (
                      <tr
                        key={row.id}
                        onClick={() => void openRow(row)}
                        className="cursor-pointer hover:bg-muted/20 transition-colors"
                      >
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{row.number}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-foreground">{row.customerName}</div>
                          {row.customerEmail && <div className="text-xs text-muted-foreground">{row.customerEmail}</div>}
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground text-xs">{row.typeLabel}</td>
                        <td className="px-4 py-3 text-muted-foreground">{formatDatePY(row.date, 'local')}</td>
                        <td className="px-4 py-3"><StatusBadge status={row.status} /></td>
                        <td className="px-4 py-3 text-right font-mono font-medium text-foreground">{formatPrice(row.total)}</td>
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
