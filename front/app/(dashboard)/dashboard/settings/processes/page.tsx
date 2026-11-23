'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, RotateCw } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/api-error';
import { processesApi, type FailedProcess } from '@/lib/api/processes';
import { useAuth } from '@/lib/auth-context';
import {
  PROCESS_KIND_LABEL,
  processDocument,
  processKey,
  processLabel,
} from '@/lib/failed-processes';
import { usePagination } from '@/lib/use-pagination';
import { useTableSort } from '@/lib/use-table-sort';
import { SortableHeader } from '@/components/sortable-header';
import { TablePagination } from '@/components/table-pagination';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('es-PY', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Asuncion',
  });

const PROCESS_SORT = {
  process: (p: FailedProcess) => processLabel(p),
  document: (p: FailedProcess) => processDocument(p)?.label ?? '',
  kind: (p: FailedProcess) => PROCESS_KIND_LABEL[p.kind],
  occurredAt: (p: FailedProcess) => new Date(p.occurredAt),
  failedAt: (p: FailedProcess) => new Date(p.failedAt),
  error: (p: FailedProcess) => p.error ?? '',
};

type RetryResult = { key: string; resolved: boolean } | { key: string; error: string };

export default function FailedProcessesPage() {
  const queryClient = useQueryClient();
  const { jwtPayload } = useAuth();
  const canRetry = (jwtPayload?.permissions ?? []).includes('processes:retry');
  const [result, setResult] = useState<RetryResult | null>(null);

  const { data: processes = [], isLoading, error } = useQuery({
    queryKey: ['failed-processes'],
    queryFn: processesApi.listFailed,
  });
  const { sorted, sort, toggle } = useTableSort(processes, PROCESS_SORT);
  const pagination = usePagination(sorted);

  const retry = useMutation({
    mutationFn: (process: FailedProcess) => processesApi.retry(process.eventId, process.consumer),
    onSuccess: ({ resolved }, process) => {
      setResult({ key: processKey(process), resolved });
      void queryClient.invalidateQueries({ queryKey: ['failed-processes'] });
    },
    onError: (err, process) => {
      setResult({ key: processKey(process), error: apiErrorMessage(err, 'No se pudo reintentar') });
      void queryClient.invalidateQueries({ queryKey: ['failed-processes'] });
    },
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Procesos con errores</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tareas que el sistema hace solo (crear una cuenta por cobrar, generar un PDF, enviar un correo…) y que no
          pudo terminar. Revisá el documento afectado y reintentá cuando esté resuelto.
        </p>
      </div>

      {result && (
        <p
          role="status"
          className={
            'error' in result || !result.resolved
              ? 'mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive'
              : 'mb-4 rounded-lg border border-accent-on/20 bg-accent-subtle px-4 py-3 text-sm text-accent-on'
          }
        >
          {'error' in result
            ? result.error
            : result.resolved
              ? 'Listo: el proceso terminó bien.'
              : 'Volvió a fallar. Revisá el detalle del error y el documento afectado.'}
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {isLoading ? (
          <p className="py-16 text-center text-sm text-muted-foreground">Cargando procesos…</p>
        ) : error ? (
          <p role="alert" className="py-16 text-center text-sm text-destructive">
            {apiErrorMessage(error, 'No se pudieron cargar los procesos')}
          </p>
        ) : processes.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <CheckCircle2 className="text-accent-on" size={28} aria-hidden />
            <p className="text-sm font-medium text-foreground">No hay procesos con errores</p>
            <p className="text-sm text-muted-foreground">Todo lo automático terminó bien.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/30 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <SortableHeader label="Proceso" sortKey="process" sort={sort} onSort={toggle} />
                    <SortableHeader label="Documento" sortKey="document" sort={sort} onSort={toggle} />
                    <SortableHeader label="Estado" sortKey="kind" sort={sort} onSort={toggle} />
                    <SortableHeader label="Ocurrió" sortKey="occurredAt" sort={sort} onSort={toggle} />
                    <SortableHeader label="Último intento" sortKey="failedAt" sort={sort} onSort={toggle} />
                    <SortableHeader label="Error" sortKey="error" sort={sort} onSort={toggle} />
                    {canRetry && <th className="px-4 py-3" aria-label="Acciones" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pagination.items.map((process) => {
                    const key = processKey(process);
                    const document = processDocument(process);
                    const retrying = retry.isPending && retry.variables && processKey(retry.variables) === key;
                    return (
                      <tr key={key}>
                        <td className="px-4 py-3 font-medium text-foreground">{processLabel(process)}</td>
                        <td className="px-4 py-3">
                          {document ? (
                            <Link href={document.href} className="text-primary hover:underline">
                              {document.label}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={process.kind === 'STUCK' ? 'destructive' : 'secondary'}>
                            {PROCESS_KIND_LABEL[process.kind]}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                          {formatDateTime(process.occurredAt)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                          {formatDateTime(process.failedAt)}
                        </td>
                        <td className="max-w-xs px-4 py-3 text-xs text-muted-foreground">
                          <span className="line-clamp-2 break-words" title={process.error ?? undefined}>
                            {process.error ?? '—'}
                          </span>
                        </td>
                        {canRetry && (
                          <td className="px-4 py-3 text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={retry.isPending}
                              onClick={() => {
                                setResult(null);
                                retry.mutate(process);
                              }}
                            >
                              <RotateCw size={14} className={retrying ? 'animate-spin' : undefined} aria-hidden />
                              {retrying ? 'Reintentando…' : 'Reintentar'}
                            </Button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <TablePagination {...pagination.controls} label="procesos" className="border-t border-border px-4 py-3" />
          </>
        )}
      </div>
    </div>
  );
}
