'use client';

import { type ReactNode, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, PackageCheck, Printer, RotateCw } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/api-error';
import { filesApi } from '@/lib/api/files';
import { type RemissionNoteDetail, remissionNotesApi } from '@/lib/api/remission-notes';
import { MODALITY_LABELS } from '@/lib/billing-series';
import { BILLING_EVENT_LABELS, billingEventDetail } from '@/lib/credit-notes';
import { formatDatePY } from '@/lib/date';
import { openPdf } from '@/lib/open-pdf';
import { usePermission } from '@/lib/permissions';
import {
  canReceiveRemission,
  canVoidRemission,
  REMISSION_MOTIVE_LABELS,
  remissionNoteNumber,
  TRANSIT_STATUS_LABELS,
  TRANSPORT_TYPE_LABELS,
} from '@/lib/remission-notes';
import { ScanPicker } from '@/components/billing/scan-picker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const SECTION_LABEL = 'text-xs font-semibold uppercase tracking-wider text-muted-foreground/60';

function KeyFact({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="bg-card px-5 py-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 truncate text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}

function InfoRow({ label, value }: Readonly<{ label: string; value: ReactNode }>) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border py-2 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

const place = (address: string, city: string | null, department: string | null) =>
  [address, [city, department].filter(Boolean).join(' — ')].filter(Boolean).join(', ');

/** Talonario: la nota es la hoja llenada a mano; se adjunta su escaneo. */
function SheetPanel({ note }: Readonly<{ note: RemissionNoteDetail }>) {
  const queryClient = useQueryClient();
  const canManage = usePermission('billing:issue');
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['remission-note', note.id] });
  const uploadScan = useMutation({
    mutationFn: async (file: File) => {
      const record = await filesApi.upload(file, { module: 'billing', entityType: 'RemissionNote', entityId: note.id });
      return remissionNotesApi.setPhysicalScan(note.id, record.id);
    },
    onSuccess: refresh,
  });
  const removeScan = useMutation({
    mutationFn: () => remissionNotesApi.setPhysicalScan(note.id, null),
    onSuccess: refresh,
  });
  const error = uploadScan.error ?? removeScan.error;
  return (
    <section className="space-y-2 rounded-xl border border-border bg-card p-5">
      <h2 className={SECTION_LABEL}>Hoja del talonario</h2>
      <p className="text-xs text-muted-foreground">
        La hoja N° {note.sequential} se llena a mano con estos datos. Adjuntá el escaneo o una foto de la copia que queda en la empresa.
      </p>
      <ScanPicker
        id="remission-scan"
        fileName={note.physicalScan?.originalName ?? null}
        uploading={uploadScan.isPending}
        disabled={removeScan.isPending}
        onOpen={note.physicalScan ? () => void openPdf(note.physicalScan!.id) : undefined}
        onPick={canManage ? (file) => uploadScan.mutate(file) : undefined}
        onRemove={canManage && note.physicalScan ? () => removeScan.mutate() : undefined}
      />
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {apiErrorMessage(error, 'No se pudo completar la acción')}
        </p>
      )}
    </section>
  );
}

const TRANSIT_CLASS = {
  IN_TRANSIT: 'bg-warn-subtle text-warn border-warn/30',
  RECEIVED: 'bg-accent-subtle text-accent-on border-accent-on/20',
  RECEIVED_WITH_DIFFERENCES: 'bg-destructive/10 text-destructive border-destructive/30',
} as const;

/** Traslado: en tránsito hasta que el destino registra lo que llegó. */
function ReceptionPanel({ note }: Readonly<{ note: RemissionNoteDetail }>) {
  const router = useRouter();
  const canReceive = usePermission('inventory:movements:create');
  if (!note.transitStatus) return null;
  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className={SECTION_LABEL}>Recepción en el destino</h2>
        <Badge variant="outline" className={TRANSIT_CLASS[note.transitStatus]}>
          {TRANSIT_STATUS_LABELS[note.transitStatus]}
        </Badge>
      </div>
      {note.transitStatus === 'IN_TRANSIT' ? (
        <>
          <p className="text-xs text-muted-foreground">
            La mercadería salió de {note.fromWarehouse?.name ?? 'el origen'} y todavía no entró a{' '}
            {note.toWarehouse?.name ?? 'el destino'}: no está disponible en ninguno de los dos.
          </p>
          {canReceive && canReceiveRemission(note) && (
            <Button className="w-full" onClick={() => router.push(`/dashboard/billing/remission-notes/${note.id}/receive`)}>
              <PackageCheck size={15} />
              Registrar recepción
            </Button>
          )}
        </>
      ) : (
        <>
          <InfoRow label="Recibida" value={formatDatePY(note.receivedAt, 'local')} />
          {note.receptionNotes && <InfoRow label="Observaciones" value={note.receptionNotes} />}
        </>
      )}
    </section>
  );
}

function VoidPanel({ note }: Readonly<{ note: RemissionNoteDetail }>) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const voidNote = useMutation({
    mutationFn: () => remissionNotesApi.void(note.id, reason.trim()),
    onSuccess: async () => {
      setOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['remission-note', note.id] }),
        queryClient.invalidateQueries({ queryKey: ['remission-notes'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory-stock'] }),
      ]);
    },
  });
  const isTransfer = note.motive === 'BRANCH_TRANSFER';
  return (
    <section className="space-y-3 rounded-xl border border-destructive/30 bg-card p-5">
      <div>
        <h2 className="text-sm font-medium text-foreground">Anular la nota</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {isTransfer
            ? 'Mientras está en tránsito: la nota se anula y la mercadería vuelve al depósito de origen.'
            : 'Si el envío no se hizo, la nota se anula. No mueve stock.'}
        </p>
      </div>
      {open ? (
        <div className="space-y-2">
          <Label htmlFor="void-reason">
            Motivo <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="void-reason"
            rows={2}
            maxLength={300}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="El camión no salió, se reprogramó el envío…"
          />
          {voidNote.isError && (
            <p role="alert" className="text-xs text-destructive">
              {apiErrorMessage(voidNote.error, 'No se pudo anular la nota')}
            </p>
          )}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setOpen(false)} disabled={voidNote.isPending}>
              Volver
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              disabled={reason.trim().length < 5 || voidNote.isPending}
              onClick={() => voidNote.mutate()}
            >
              {voidNote.isPending ? 'Anulando…' : 'Confirmar anulación'}
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="destructive" className="w-full" onClick={() => setOpen(true)}>
          Anular nota de remisión
        </Button>
      )}
    </section>
  );
}

export default function RemissionNoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const canVoid = usePermission('billing:cancel');

  const { data: note, isLoading, error } = useQuery({
    queryKey: ['remission-note', id],
    queryFn: () => remissionNotesApi.get(id),
  });

  const retryPdf = useMutation({
    mutationFn: () => remissionNotesApi.retryPdf(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['remission-note', id] }),
  });

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

  const onSheet = note.modality === 'PREPRINTED';
  const voided = note.status === 'VOIDED';
  const received = note.transitStatus === 'RECEIVED' || note.transitStatus === 'RECEIVED_WITH_DIFFERENCES';
  const motive =
    note.motive === 'OTHER' && note.motiveDetail ? `Otros: ${note.motiveDetail}` : REMISSION_MOTIVE_LABELS[note.motive];

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => router.push('/dashboard/billing')}
        className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft size={15} />
        Facturación
      </button>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-foreground">
              Nota de remisión <span className="font-mono">{remissionNoteNumber(note)}</span>
            </h1>
            <Badge variant={voided ? 'destructive' : 'outline'}>{voided ? 'Anulada' : 'Vigente'}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {motive} · {MODALITY_LABELS[note.modality]}
          </p>
        </div>
        {!onSheet && note.pdfFileId && (
          <Button variant="outline" onClick={() => void openPdf(note.pdfFileId!)}>
            <Printer size={15} />
            Imprimir / descargar PDF
          </Button>
        )}
        {!onSheet && !note.pdfFileId && (
          <div className="flex flex-col items-end gap-1">
            <Button variant="outline" disabled={retryPdf.isPending} onClick={() => retryPdf.mutate()}>
              <RotateCw size={15} className={retryPdf.isPending ? 'animate-spin' : ''} />
              {retryPdf.isPending ? 'Generando…' : 'Generar PDF'}
            </Button>
            {retryPdf.isError && (
              <p role="alert" className="text-xs text-destructive">
                {apiErrorMessage(retryPdf.error, 'No se pudo generar el PDF')}
              </p>
            )}
          </div>
        )}
      </div>

      {voided && note.voidReason && (
        <div role="status" className="mb-6 rounded-xl border border-destructive/30 bg-destructive/10 px-5 py-3 text-sm text-destructive">
          Anulada el {formatDatePY(note.voidedAt, 'local')}: {note.voidReason}
        </div>
      )}

      <dl className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-4">
        <KeyFact label="Sale de" value={note.fromWarehouse?.name ?? note.branch.name} />
        <KeyFact label="Llega a" value={note.toWarehouse?.name ?? note.recipientName} />
        <KeyFact label="Inicio del traslado" value={formatDatePY(note.transportStartDate, 'utc')} />
        <KeyFact label="Fin del traslado" value={formatDatePY(note.transportEndDate, 'utc')} />
      </dl>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          <section className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="border-b border-border px-5 py-4">
              <h2 className={SECTION_LABEL}>Mercadería</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
                  <tr>
                    <th className="px-5 py-3 text-left">Descripción</th>
                    <th className="px-5 py-3 text-left">Unidad</th>
                    <th className="px-5 py-3 text-right">Cantidad</th>
                    <th className="px-5 py-3 text-left">N° de serie</th>
                    {received && <th className="px-5 py-3 text-right">Llegó</th>}
                    {received && <th className="px-5 py-3 text-right">Faltó</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {note.items.map((item) => (
                    <tr key={item.id}>
                      <td className="px-5 py-3 font-medium text-foreground">{item.description}</td>
                      <td className="px-5 py-3 text-muted-foreground">{item.unit}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-foreground">{item.quantity}</td>
                      <td className="px-5 py-3 font-mono text-xs text-muted-foreground">
                        {item.serialNumbers.length > 0 ? item.serialNumbers.join(', ') : '—'}
                      </td>
                      {received && (
                        <td className="px-5 py-3 text-right tabular-nums text-foreground">{item.receivedQuantity ?? 0}</td>
                      )}
                      {received && (
                        <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">
                          {item.quantity - (item.receivedQuantity ?? 0) || '—'}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="grid gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-2">
            <div className="bg-card px-5 py-4">
              <h2 className={`${SECTION_LABEL} mb-1`}>Punto de partida</h2>
              <p className="text-sm text-foreground">{place(note.originAddress, note.originCity, note.originDepartment)}</p>
            </div>
            <div className="bg-card px-5 py-4">
              <h2 className={`${SECTION_LABEL} mb-1`}>Punto de llegada</h2>
              <p className="text-sm text-foreground">
                {place(note.destinationAddress, note.destinationCity, note.destinationDepartment)}
              </p>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card px-5 py-4">
            <h2 className={`${SECTION_LABEL} mb-1`}>Transporte</h2>
            <InfoRow label="Tipo" value={TRANSPORT_TYPE_LABELS[note.transportType]} />
            <InfoRow label="Vehículo" value={note.vehicleBrand} />
            <InfoRow label="Chapa o RUA" value={<span className="font-mono">{note.vehiclePlate}</span>} />
            {note.trailerPlate && (
              <InfoRow label="Remolque" value={<span className="font-mono">{note.trailerPlate}</span>} />
            )}
            <InfoRow label="Transportista" value={note.carrierName} />
            <InfoRow label="RUC del transportista" value={note.carrierRuc} />
            <InfoRow label="Domicilio fiscal" value={note.carrierAddress} />
            <InfoRow label="Conductor" value={note.driverName} />
            <InfoRow label="Cédula del conductor" value={note.driverDocument} />
            <InfoRow label="Dirección del conductor" value={note.driverAddress} />
            {note.notes && <InfoRow label="Observaciones" value={note.notes} />}
          </section>
        </div>

        <div className="space-y-6">
          <ReceptionPanel note={note} />
          {onSheet && <SheetPanel note={note} />}

          <section className="divide-y divide-border rounded-xl border border-border bg-card">
            <div className="px-5 py-4">
              <h2 className={`${SECTION_LABEL} mb-1`}>Destinatario</h2>
              <InfoRow label="Nombre" value={note.recipientName} />
              <InfoRow label="RUC o cédula" value={note.recipientDocument} />
              {note.invoice && (
                <InfoRow
                  label="Factura"
                  value={
                    <Link href={`/dashboard/billing/invoices/${note.invoice.id}`} className="font-mono text-primary hover:underline">
                      {`${note.invoice.invoicePrefix ?? ''}${note.invoice.invoiceNumber ?? ''}`}
                    </Link>
                  }
                />
              )}
            </div>
            <div className="px-5 py-4">
              <h2 className={`${SECTION_LABEL} mb-1`}>Timbrado</h2>
              <InfoRow label="N° de timbrado" value={note.timbrado} />
              {note.timbradoValidUntil && (
                <InfoRow
                  label="Vigencia"
                  value={`${formatDatePY(note.timbradoValidFrom, 'utc')} al ${formatDatePY(note.timbradoValidUntil, 'utc')}`}
                />
              )}
              <InfoRow label="Sucursal" value={note.branch.name} />
              <InfoRow label="Emitida" value={formatDatePY(note.issuedAt, 'local')} />
            </div>
            <div className="px-5 py-4">
              <h2 className={`${SECTION_LABEL} mb-2`}>Historial</h2>
              {note.events.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin movimientos.</p>
              ) : (
                <ol className="space-y-2">
                  {note.events.map((event) => (
                    <li key={event.id} className="text-sm">
                      <span className="font-medium text-foreground">{BILLING_EVENT_LABELS[event.type]}</span>
                      <span className="text-muted-foreground"> · {formatDatePY(event.createdAt, 'local')}</span>
                      {billingEventDetail(event) && (
                        <p className="text-xs text-muted-foreground">{billingEventDetail(event)}</p>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </section>

          {canVoid && canVoidRemission(note) && <VoidPanel note={note} />}
        </div>
      </div>
    </div>
  );
}
