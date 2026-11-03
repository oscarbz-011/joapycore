'use client';

import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Truck } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/api-error';
import { type RemissionNote, remissionNotesApi } from '@/lib/api/remission-notes';
import { formatDatePY } from '@/lib/date';
import {
  REMISSION_MOTIVE_LABELS,
  remissionDestination,
  remissionNoteNumber,
  remissionOrigin,
  TRANSIT_STATUS_LABELS,
} from '@/lib/remission-notes';
import { useTableSort } from '@/lib/use-table-sort';
import { usePagination } from '@/lib/use-pagination';
import { RequirePermission } from '@/components/require-permission';
import { SortableHeader } from '@/components/sortable-header';
import { TablePagination } from '@/components/table-pagination';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

const invoiceNumber = (note: RemissionNote) =>
  note.invoice ? `${note.invoice.invoicePrefix ?? ''}${note.invoice.invoiceNumber ?? ''}` : '';

const SORT = {
  number: remissionNoteNumber,
  motive: (note: RemissionNote) => REMISSION_MOTIVE_LABELS[note.motive],
  origin: remissionOrigin,
  destination: remissionDestination,
  invoice: invoiceNumber,
  start: (note: RemissionNote) => new Date(note.transportStartDate),
  transit: (note: RemissionNote) => (note.transitStatus ? TRANSIT_STATUS_LABELS[note.transitStatus] : ''),
  status: (note: RemissionNote) => note.status,
};

export function RemissionNotesTab() {
  const router = useRouter();
  const { data: notes = [], isLoading, error } = useQuery({
    queryKey: ['remission-notes'],
    queryFn: remissionNotesApi.list,
  });
  const { sorted, sort, toggle } = useTableSort(notes, SORT);
  const pagination = usePagination(sorted);
  const inTransit = notes.filter((n) => n.status === 'ISSUED' && n.transitStatus === 'IN_TRANSIT').length;

  const newTransfer = (
    <RequirePermission permission="billing:issue">
      <Button onClick={() => router.push('/dashboard/billing/remission-notes/new')}>
        <Truck size={15} className="mr-1.5" />
        Traslado entre sucursales
      </Button>
    </RequirePermission>
  );

  if (isLoading) return <div className="py-16 text-center text-sm text-muted-foreground">Cargando...</div>;
  if (error) {
    return (
      <p role="alert" className="py-16 text-center text-sm text-destructive">
        {apiErrorMessage(error, 'No se pudieron cargar las notas de remisión')}
      </p>
    );
  }
  if (notes.length === 0) {
    return (
      <div className="space-y-4 py-16 text-center">
        <div>
          <p className="text-sm text-muted-foreground">No hay notas de remisión emitidas.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Son obligatorias para trasladar mercadería entre sucursales. La de una venta se emite desde la factura.
          </p>
        </div>
        <div className="flex justify-center">{newTransfer}</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {inTransit === 0
            ? 'No hay traslados en tránsito.'
            : `${inTransit} ${inTransit === 1 ? 'traslado en tránsito' : 'traslados en tránsito'}: se reciben desde el detalle de la nota.`}
        </p>
        {newTransfer}
      </div>
      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/30 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <tr>
                <SortableHeader label="N° Nota" sortKey="number" sort={sort} onSort={toggle} />
                <SortableHeader label="Motivo" sortKey="motive" sort={sort} onSort={toggle} />
                <SortableHeader label="Sale de" sortKey="origin" sort={sort} onSort={toggle} />
                <SortableHeader label="Llega a" sortKey="destination" sort={sort} onSort={toggle} />
                <SortableHeader label="Factura" sortKey="invoice" sort={sort} onSort={toggle} />
                <SortableHeader label="Inicio del traslado" sortKey="start" sort={sort} onSort={toggle} />
                <SortableHeader label="Recepción" sortKey="transit" sort={sort} onSort={toggle} />
                <SortableHeader label="Estado" sortKey="status" sort={sort} onSort={toggle} />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pagination.items.map((note: RemissionNote) => (
                <tr
                  key={note.id}
                  onClick={() => router.push(`/dashboard/billing/remission-notes/${note.id}`)}
                  className="cursor-pointer transition-colors hover:bg-muted/20"
                >
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-foreground">{remissionNoteNumber(note)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{REMISSION_MOTIVE_LABELS[note.motive]}</td>
                  <td className="px-4 py-3 text-muted-foreground">{remissionOrigin(note)}</td>
                  <td className="px-4 py-3 font-medium text-foreground">{remissionDestination(note)}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-muted-foreground">
                    {invoiceNumber(note) || '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    {formatDatePY(note.transportStartDate, 'utc')}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    {note.status === 'ISSUED' && note.transitStatus ? TRANSIT_STATUS_LABELS[note.transitStatus] : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={note.status === 'VOIDED' ? 'destructive' : 'outline'}>
                      {note.status === 'VOIDED' ? 'Anulada' : 'Vigente'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <TablePagination
          {...pagination.controls}
          label="notas de remisión"
          className="border-t border-border px-4 py-3"
        />
      </Card>
    </div>
  );
}
