'use client';

import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/api-error';
import { billingApi, type BillingSeries } from '@/lib/api/billing';
import {
  MODALITY_LABELS,
  SERIES_STATUS_LABELS,
  seriesStatus,
  type SeriesStatus,
} from '@/lib/billing-series';
import { formatDatePY } from '@/lib/date';
import { usePermission } from '@/lib/permissions';
import { useTableSort } from '@/lib/use-table-sort';
import { usePagination } from '@/lib/use-pagination';
import { SortableHeader } from '@/components/sortable-header';
import { TablePagination } from '@/components/table-pagination';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

const DOCUMENT_TYPE_LABELS: Record<BillingSeries['documentType'], string> = {
  INVOICE: 'Factura',
  CREDIT_NOTE: 'Nota de crédito',
};

const STATUS_CLASS: Record<SeriesStatus, string> = {
  active: 'bg-accent-subtle text-accent-on border-accent-on/20',
  inactive: '',
  incomplete: 'bg-warn-subtle text-warn border-warn/30',
  expired: 'bg-warn-subtle text-warn border-warn/30',
  upcoming: '',
};

const SORT = {
  branch: (s: BillingSeries) => s.branch.name,
  type: (s: BillingSeries) => DOCUMENT_TYPE_LABELS[s.documentType],
  modality: (s: BillingSeries) => MODALITY_LABELS[s.modality],
  timbrado: (s: BillingSeries) => s.timbrado,
  validFrom: (s: BillingSeries) => (s.validFrom ? new Date(s.validFrom) : null),
  validUntil: (s: BillingSeries) => (s.validUntil ? new Date(s.validUntil) : null),
  establecimiento: (s: BillingSeries) => s.establecimiento,
  punto: (s: BillingSeries) => s.puntoExpedicion,
  rangeFrom: (s: BillingSeries) => s.rangeFrom,
  rangeTo: (s: BillingSeries) => s.rangeTo,
  next: (s: BillingSeries) => s.nextNumber,
  status: (s: BillingSeries) => SERIES_STATUS_LABELS[seriesStatus(s)],
};

export default function BillingSeriesPage() {
  const router = useRouter();
  const canManage = usePermission('billing:series:manage');
  const { data: series = [], isLoading, error } = useQuery({
    queryKey: ['billing-series'],
    queryFn: billingApi.listSeries,
  });
  const { sorted, sort, toggle } = useTableSort(series, SORT);
  const pagination = usePagination(sorted);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Series de facturación</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Los timbrados con los que se numeran las facturas de cada sucursal y punto de expedición.
          </p>
        </div>
        {canManage && (
          <Button onClick={() => router.push('/dashboard/settings/billing-series/new')}>
            <Plus size={16} className="mr-1.5" />
            Nueva serie
          </Button>
        )}
      </div>

      {isLoading && <div className="py-16 text-center text-sm text-muted-foreground">Cargando…</div>}

      {error && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {apiErrorMessage(error, 'No se pudieron cargar las series')}
        </div>
      )}

      {!isLoading && !error && series.length === 0 && (
        <Card className="px-6 py-14 text-center">
          <p className="text-sm font-medium text-foreground">Todavía no cargaste series.</p>
          <p className="mt-1 text-sm text-muted-foreground">Sin una serie vigente no se puede facturar.</p>
          {canManage && (
            <Button className="mt-4" onClick={() => router.push('/dashboard/settings/billing-series/new')}>
              Cargar la primera serie
            </Button>
          )}
        </Card>
      )}

      {series.length > 0 && (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/30 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <SortableHeader label="Sucursal" sortKey="branch" sort={sort} onSort={toggle} />
                  <SortableHeader label="Tipo" sortKey="type" sort={sort} onSort={toggle} />
                  <SortableHeader label="Modalidad" sortKey="modality" sort={sort} onSort={toggle} />
                  <SortableHeader label="Timbrado" sortKey="timbrado" sort={sort} onSort={toggle} />
                  <SortableHeader label="Vigencia desde" sortKey="validFrom" sort={sort} onSort={toggle} />
                  <SortableHeader label="Vigencia hasta" sortKey="validUntil" sort={sort} onSort={toggle} />
                  <SortableHeader label="Establecimiento" sortKey="establecimiento" sort={sort} onSort={toggle} />
                  <SortableHeader label="Punto" sortKey="punto" sort={sort} onSort={toggle} />
                  <SortableHeader label="Rango desde" sortKey="rangeFrom" sort={sort} onSort={toggle} align="right" />
                  <SortableHeader label="Rango hasta" sortKey="rangeTo" sort={sort} onSort={toggle} align="right" />
                  <SortableHeader label="Próximo número" sortKey="next" sort={sort} onSort={toggle} align="right" />
                  <SortableHeader label="Estado" sortKey="status" sort={sort} onSort={toggle} />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pagination.items.map((s) => {
                  const status = seriesStatus(s);
                  return (
                    <tr
                      key={s.id}
                      tabIndex={0}
                      onClick={() => router.push(`/dashboard/settings/billing-series/${s.id}/edit`)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') router.push(`/dashboard/settings/billing-series/${s.id}/edit`);
                      }}
                      className="cursor-pointer transition-colors hover:bg-muted/20 focus:bg-muted/20 focus:outline-none"
                    >
                      <td className="px-4 py-3 font-medium text-foreground">{s.branch.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{DOCUMENT_TYPE_LABELS[s.documentType]}</td>
                      <td className="px-4 py-3 text-muted-foreground">{MODALITY_LABELS[s.modality]}</td>
                      <td className="px-4 py-3 font-mono text-xs">{s.timbrado ?? '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDatePY(s.validFrom)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDatePY(s.validUntil)}</td>
                      <td className="px-4 py-3 font-mono text-xs">{s.establecimiento}</td>
                      <td className="px-4 py-3 font-mono text-xs">{s.puntoExpedicion}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs">{s.rangeFrom}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs">{s.rangeTo}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs">{s.nextNumber}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={STATUS_CLASS[status]}>
                          {SERIES_STATUS_LABELS[status]}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <TablePagination
            {...pagination.controls}
            label="series"
            className="border-t border-border px-4 py-3"
          />
        </Card>
      )}
    </div>
  );
}
