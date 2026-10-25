'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Monitor, Plus } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/api-error';
import { posApi, type PosTerminal } from '@/lib/api/pos';
import { branchesApi } from '@/lib/api/branches';
import { PRINT_FORMAT_LABELS } from '@/lib/pos-receipt';
import { useTableSort } from '@/lib/use-table-sort';
import { usePagination } from '@/lib/use-pagination';
import { SortableHeader } from '@/components/sortable-header';
import { TablePagination } from '@/components/table-pagination';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

const TERMINAL_SORT = {
  name: (t: PosTerminal) => t.name,
  branch: (t: PosTerminal) => t.branch.name,
  series: (t: PosTerminal) => (t.invoiceSeriesId ? 1 : 0),
  print: (t: PosTerminal) => PRINT_FORMAT_LABELS[t.printFormat],
  status: (t: PosTerminal) => (t.isActive ? 1 : 0),
};

export default function PosTerminalsSettingsPage() {
  const router = useRouter();
  const { data: terminals = [], isLoading, error } = useQuery({
    queryKey: ['pos-terminals'],
    queryFn: posApi.listTerminals,
  });
  const { data: branches = [] } = useQuery({ queryKey: ['branches'], queryFn: branchesApi.listBranches });

  const { sorted, sort, toggle } = useTableSort(terminals, TERMINAL_SORT);
  const pagination = usePagination(sorted);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Cajas registradoras</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cada caja factura con una serie de su sucursal e imprime en el formato que tenga configurado.
          </p>
        </div>
        {branches.length > 0 && (
          <Button onClick={() => router.push('/dashboard/settings/pos-terminals/new')}>
            <Plus size={15} /> Nueva caja
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-muted/30" />
          ))}
        </div>
      ) : error ? (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {apiErrorMessage(error, 'No se pudieron cargar las cajas')}
        </div>
      ) : terminals.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Monitor size={32} className="mb-3 text-muted-foreground/60" />
          <p className="text-sm text-muted-foreground">
            {branches.length === 0
              ? 'Creá primero una sucursal en Ajustes → Sucursales.'
              : 'No hay cajas registradas.'}
          </p>
          {branches.length > 0 && (
            <Link href="/dashboard/settings/pos-terminals/new" className="mt-3 text-sm font-medium text-primary hover:underline">
              Crear la primera
            </Link>
          )}
        </div>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/30 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <SortableHeader label="Caja" sortKey="name" sort={sort} onSort={toggle} />
                  <SortableHeader label="Sucursal" sortKey="branch" sort={sort} onSort={toggle} />
                  <SortableHeader label="Serie de facturas" sortKey="series" sort={sort} onSort={toggle} />
                  <SortableHeader label="Impresión" sortKey="print" sort={sort} onSort={toggle} />
                  <SortableHeader label="Estado" sortKey="status" sort={sort} onSort={toggle} />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pagination.items.map((t) => (
                  <tr key={t.id} className="transition-colors hover:bg-muted/20">
                    <td className="px-4 py-3 font-medium">
                      <Link href={`/dashboard/settings/pos-terminals/${t.id}/edit`} className="text-foreground hover:text-primary hover:underline">
                        {t.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{t.branch.name}</td>
                    <td className="px-4 py-3">
                      {t.invoiceSeriesId ? (
                        <span className="text-muted-foreground">Asignada</span>
                      ) : (
                        <span className="font-medium text-warn">Sin serie: no puede cobrar</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{PRINT_FORMAT_LABELS[t.printFormat]}</td>
                    <td className="px-4 py-3 text-muted-foreground">{t.isActive ? 'Activa' : 'Inactiva'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePagination {...pagination.controls} label="cajas" className="border-t border-border px-4 py-3" />
        </Card>
      )}
    </div>
  );
}
