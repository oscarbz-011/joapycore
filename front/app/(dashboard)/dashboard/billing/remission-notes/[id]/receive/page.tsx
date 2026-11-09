'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, PackageCheck } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/api-error';
import { remissionNotesApi } from '@/lib/api/remission-notes';
import { formatDatePY } from '@/lib/date';
import {
  canReceiveRemission,
  fullReception,
  type GoodsDraftLine,
  lineQuantity,
  missingUnits,
  receptionPayload,
  receptionProblem,
  remissionNoteNumber,
  TRANSIT_STATUS_LABELS,
} from '@/lib/remission-notes';
import { RequirePermission } from '@/components/require-permission';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const SECTION_LABEL = 'text-xs font-semibold uppercase tracking-wider text-muted-foreground/60';

export default function ReceiveRemissionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: note, isLoading, error } = useQuery({
    queryKey: ['remission-note', id],
    queryFn: () => remissionNotesApi.get(id),
  });

  const [linesState, setLines] = useState<Record<string, GoodsDraftLine> | null>(null);
  const [notes, setNotes] = useState('');

  const receive = useMutation({
    mutationFn: () => {
      if (!note) throw new Error('Nota no cargada');
      return remissionNotesApi.receive(id, receptionPayload(note.items, lines, notes));
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['remission-note', id] }),
        queryClient.invalidateQueries({ queryKey: ['remission-notes'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory-stock'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory-movements'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory-product-units'] }),
      ]);
      router.push(`/dashboard/billing/remission-notes/${id}`);
    },
  });

  const back = () => router.push(`/dashboard/billing/remission-notes/${id}`);

  if (isLoading) {
    return <div className="py-24 text-center text-sm text-muted-foreground/60">Cargando nota de remisión...</div>;
  }
  if (error || !note) {
    return (
      <div className="py-24 text-center">
        <p role="alert" className="text-sm text-destructive">
          {apiErrorMessage(error, 'No se encontró la nota de remisión')}
        </p>
        <button
          type="button"
          onClick={() => router.push('/dashboard/billing')}
          className="mt-3 text-sm font-medium text-foreground underline underline-offset-2"
        >
          Volver a Facturación
        </button>
      </div>
    );
  }

  const lines = linesState ?? fullReception(note.items);
  const lineOf = (itemId: string): GoodsDraftLine => lines[itemId] ?? { quantity: 0, serialNumbers: [] };
  const setLine = (itemId: string, patch: Partial<GoodsDraftLine>) =>
    setLines({ ...lines, [itemId]: { ...lineOf(itemId), ...patch } });

  if (!canReceiveRemission(note)) {
    return (
      <div className="py-24 text-center">
        <p className="text-sm text-muted-foreground">
          {note.status === 'VOIDED'
            ? 'La nota está anulada: no hay mercadería que recibir.'
            : note.transitStatus
              ? `Esta nota ya está ${TRANSIT_STATUS_LABELS[note.transitStatus].toLowerCase()}.`
              : 'Solo un traslado entre depósitos se recibe en el destino.'}
        </p>
        <button type="button" onClick={back} className="mt-3 text-sm font-medium text-foreground underline underline-offset-2">
          Volver a la nota
        </button>
      </div>
    );
  }

  const missing = missingUnits(note.items, lines);
  const problem = receptionProblem(note.items, lines, notes);

  return (
    <div className="w-full space-y-6">
      <button
        type="button"
        onClick={back}
        className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft size={15} />
        Nota de remisión <span className="font-mono">{remissionNoteNumber(note)}</span>
      </button>

      <div>
        <h1 className="text-2xl font-semibold text-foreground">Recibir mercadería</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          De {note.fromWarehouse?.name ?? note.branch.name} a {note.toWarehouse?.name ?? '—'}, despachada el{' '}
          {formatDatePY(note.issuedAt, 'local')}. Contá lo que llegó: eso entra al depósito; lo que falta queda como
          faltante del traslado.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="min-w-0 overflow-hidden p-0">
          <div className="border-b border-border px-5 py-4">
            <h2 className={SECTION_LABEL}>Mercadería despachada</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="whitespace-nowrap bg-muted/30 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
                <tr>
                  <th className="px-4 py-3 text-left">Descripción</th>
                  <th className="px-4 py-3 text-left">Unidad</th>
                  <th className="px-4 py-3 text-right">Despachado</th>
                  <th className="px-4 py-3 text-right">Llegó</th>
                  <th className="px-4 py-3 text-right">Falta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {note.items.map((item) => {
                  const serialized = item.serialNumbers.length > 0;
                  const line = lineOf(item.id);
                  const arrived = lineQuantity(line, serialized);
                  const short = Math.max(item.quantity - arrived, 0);
                  return (
                    <tr key={item.id} className="align-top">
                      <td className="px-4 py-3">
                        <span className="font-medium text-foreground">{item.description}</span>
                        {serialized && (
                          <fieldset className="mt-2 space-y-1.5">
                            <legend className="text-xs text-muted-foreground">
                              Números de serie que llegaron ({line.serialNumbers.length} de {item.quantity})
                            </legend>
                            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                              {item.serialNumbers.map((serial) => (
                                <label key={serial} className="flex items-center gap-1.5 text-xs text-foreground">
                                  <Checkbox
                                    checked={line.serialNumbers.includes(serial)}
                                    disabled={receive.isPending}
                                    onCheckedChange={(next) =>
                                      setLine(item.id, {
                                        serialNumbers: next
                                          ? [...line.serialNumbers, serial]
                                          : line.serialNumbers.filter((s) => s !== serial),
                                      })
                                    }
                                  />
                                  <span className="font-mono">{serial}</span>
                                </label>
                              ))}
                            </div>
                          </fieldset>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{item.unit}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{item.quantity}</td>
                      <td className="px-4 py-3 text-right">
                        {serialized ? (
                          <span className="tabular-nums text-foreground">{arrived}</span>
                        ) : (
                          <Input
                            aria-label={`Cantidad de ${item.description} que llegó`}
                            inputMode="numeric"
                            className="ml-auto w-24 text-right"
                            disabled={receive.isPending}
                            value={String(line.quantity)}
                            onChange={(e) =>
                              setLine(item.id, { quantity: Number(e.target.value.replace(/\D/g, '') || 0) })
                            }
                          />
                        )}
                      </td>
                      <td className={`px-4 py-3 text-right tabular-nums ${short > 0 ? 'font-medium text-destructive' : 'text-muted-foreground'}`}>
                        {short}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="space-y-4 p-6">
          <h2 className={SECTION_LABEL}>Confirmar</h2>
          <p className="text-sm text-foreground">
            {missing === 0
              ? 'Llegó todo lo despachado.'
              : `Faltan ${missing} ${missing === 1 ? 'unidad' : 'unidades'}: no van a entrar al depósito.`}
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="reception-notes">
              Observaciones {missing > 0 && <span className="text-destructive">*</span>}
            </Label>
            <Textarea
              id="reception-notes"
              rows={3}
              maxLength={500}
              value={notes}
              disabled={receive.isPending}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Qué faltó o llegó dañado, quién lo controló…"
            />
          </div>
          {receive.isError && (
            <p role="alert" className="text-xs text-destructive">
              {apiErrorMessage(receive.error, 'No se pudo registrar la recepción')}
            </p>
          )}
          {problem && !receive.isError && <p className="text-xs text-muted-foreground">{problem}</p>}
          <RequirePermission permission="inventory:movements:create">
            <Button className="w-full" disabled={Boolean(problem) || receive.isPending} onClick={() => receive.mutate()}>
              <PackageCheck size={15} />
              {receive.isPending ? 'Registrando…' : 'Confirmar recepción'}
            </Button>
          </RequirePermission>
        </Card>
      </div>
    </div>
  );
}
