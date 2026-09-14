'use client';

import { RequirePermission } from '@/components/require-permission';

import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, paymentMethodLabel } from '@/lib/payment-methods';

import { apiErrorMessage } from '@/lib/api/api-error';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, MapPin, CheckCircle2, AlertOctagon } from 'lucide-react';
import {
  cobranzasApi,
  type CollectionRoute,
  type CollectionRouteStatus,
  type VisitResult,
  type PaymentAgreement,
  type AgreementStatus,
  type DelinquencyReport,
  type DelinquencyReportStatus,
} from '../../../../lib/api/cobranzas';
import { todayISODate } from '../../../../lib/date';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtGs(n: number) {
  return 'Gs. ' + Math.round(n).toLocaleString('es-PY');
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'UTC' });
}

// ── Status maps ────────────────────────────────────────────────────────────────

const ROUTE_STATUS: Record<CollectionRouteStatus, { label: string; className: string; destructive?: boolean }> = {
  OPEN:      { label: 'Abierta',   className: 'bg-accent-subtle text-accent-on border-accent-on/20' },
  CLOSED:    { label: 'Cerrada',   className: 'bg-muted/30 text-muted-foreground border-border' },
  CANCELLED: { label: 'Cancelada', className: '', destructive: true },
};

const AGREEMENT_STATUS: Record<AgreementStatus, { label: string; className: string; destructive?: boolean }> = {
  ACTIVE:    { label: 'Activo',     className: 'bg-accent-subtle text-accent-on border-accent-on/20' },
  FULFILLED: { label: 'Cumplido',   className: 'bg-muted/30 text-muted-foreground border-border' },
  BROKEN:    { label: 'Incumplido', className: '', destructive: true },
  CANCELLED: { label: 'Cancelado',  className: 'bg-muted/30 text-muted-foreground border-border' },
};

const VISIT_RESULT_LABELS: Record<VisitResult, string> = {
  COLLECTED: 'Cobrado',
  PARTIAL:   'Cobrado parcial',
  ABSENT:    'Ausente',
  REFUSED:   'Se negó',
  PROMISE:   'Prometió pago',
};

const DELINQUENCY_STATUS: Record<DelinquencyReportStatus, { label: string; className: string; destructive?: boolean }> = {
  PENDING_REVIEW: { label: 'Por revisar', className: 'bg-warn-subtle text-warn border-warn/30' },
  REPORTED:       { label: 'Reportado',   className: '', destructive: true },
  EXCLUDED:       { label: 'Excluido',    className: 'bg-muted/30 text-muted-foreground border-border' },
};

// ── Constants ──────────────────────────────────────────────────────────────────

const NUM_CLS = 'h-9 w-full min-w-0 rounded-3xl border border-transparent bg-input/50 px-3 text-sm outline-none transition-[color,box-shadow,background-color] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30';
const TEXTAREA_CLS = 'w-full min-w-0 rounded-2xl border border-transparent bg-input/50 px-3 py-2 text-sm outline-none resize-none transition-[color,box-shadow,background-color] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30';

// ── KPI Card ───────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card className="px-5 py-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">{label}</p>
      <p className="mt-1 text-2xl font-bold text-foreground tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground/60">{sub}</p>}
    </Card>
  );
}

// ── Route Detail Panel (Sheet) ─────────────────────────────────────────────────

function RouteDetailPanel({
  route,
  open,
  onOpenChange,
}: {
  route: CollectionRoute;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [recordingVisit, setRecordingVisit] = useState<string | null>(null);
  const [resultForm, setResultForm] = useState<{
    result: VisitResult; collectedAmount: string; paymentMethod: string; notes: string;
  }>({ result: 'COLLECTED', collectedAmount: '', paymentMethod: 'CASH', notes: '' });

  const qc = useQueryClient();

  const recordMutation = useMutation({
    mutationFn: ({ visitId, data }: { visitId: string; data: typeof resultForm }) =>
      cobranzasApi.recordVisitResult(route.id, visitId, {
        result: data.result,
        collectedAmount: data.collectedAmount ? Number(data.collectedAmount) : undefined,
        paymentMethod: data.paymentMethod,
        notes: data.notes || undefined,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['collection-routes'] });
      setRecordingVisit(null);
    },
  });

  const closeMutation = useMutation({
    mutationFn: () => cobranzasApi.closeRoute(route.id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['collection-routes'] });
      onOpenChange(false);
    },
  });

  const pct = route.totalPlanned > 0 ? Math.min(100, (route.totalCollected / route.totalPlanned) * 100) : 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full max-w-lg flex-col p-0 sm:max-w-lg" showCloseButton>
        <SheetHeader className="border-b border-border px-5 py-4 shrink-0">
          <SheetTitle>Ruta — {fmtDate(route.routeDate)}</SheetTitle>
          <SheetDescription>
            {route.collector
              ? `Cobrador: ${route.collector.firstName} ${route.collector.lastName}`
              : 'Sin cobrador asignado'}
          </SheetDescription>
        </SheetHeader>

        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-4 border-b border-border px-5 py-4 shrink-0">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Planeado</p>
            <p className="mt-1 text-base font-bold text-foreground tabular-nums">{fmtGs(route.totalPlanned)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Cobrado</p>
            <p className="mt-1 text-base font-bold text-emerald-600 tabular-nums">{fmtGs(route.totalCollected)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Pendiente</p>
            <p className="mt-1 text-base font-bold text-amber-600 tabular-nums">
              {fmtGs(Math.max(0, route.totalPlanned - route.totalCollected))}
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="px-5 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 rounded-full bg-muted/20">
              <div className="h-2 rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs text-muted-foreground/60 tabular-nums">{Math.round(pct)}%</span>
          </div>
        </div>

        {/* Visits */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-3">
            Visitas ({route.visits.length})
          </p>

          {route.visits.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground/60">No hay visitas en esta ruta</p>
          )}

          <div className="space-y-3">
            {route.visits.map((visit) => (
              <div key={visit.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {visit.customer.firstName} {visit.customer.lastName}
                    </p>
                    {visit.customer.address && (
                      <p className="mt-0.5 text-xs text-muted-foreground/60">{visit.customer.address}</p>
                    )}
                    {visit.customer.phone && (
                      <p className="text-xs text-muted-foreground/60">{visit.customer.phone}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-foreground tabular-nums">{fmtGs(visit.plannedAmount)}</p>
                    {visit.installment && (
                      <p className="text-xs text-muted-foreground/60 mt-0.5">Cuota #{visit.installment.number}</p>
                    )}
                  </div>
                </div>

                {visit.result ? (
                  <div className="mt-3 flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2">
                    <span className="text-xs font-semibold text-foreground">{VISIT_RESULT_LABELS[visit.result]}</span>
                    {visit.collectedAmount > 0 && (
                      <span className="text-sm font-bold text-emerald-600 tabular-nums">{fmtGs(visit.collectedAmount)}</span>
                    )}
                  </div>
                ) : route.status === 'OPEN' ? (
                  recordingVisit === visit.id ? (
                    <div className="mt-3 space-y-2">
                      <Select value={resultForm.result} onValueChange={(v) => v && setResultForm((f) => ({ ...f, result: v as VisitResult }))}>
                        <SelectTrigger className="w-full">
                          <span className="flex-1 text-left text-sm truncate">{VISIT_RESULT_LABELS[resultForm.result]}</span>
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.entries(VISIT_RESULT_LABELS) as [VisitResult, string][]).map(([k, label]) => (
                            <SelectItem key={k} value={k}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {(resultForm.result === 'COLLECTED' || resultForm.result === 'PARTIAL') && (
                        <>
                          <input
                            type="number"
                            placeholder="Monto cobrado"
                            className={NUM_CLS}
                            value={resultForm.collectedAmount}
                            onChange={(e) => setResultForm((f) => ({ ...f, collectedAmount: e.target.value }))}
                          />
                          <Select value={resultForm.paymentMethod} onValueChange={(v) => v && setResultForm((f) => ({ ...f, paymentMethod: v }))}>
                            <SelectTrigger className="w-full">
                              <span className="flex-1 text-left text-sm truncate">
                                {paymentMethodLabel(resultForm.paymentMethod)}
                              </span>
                            </SelectTrigger>
                            <SelectContent>
                              {PAYMENT_METHODS.map((m) => (
                                <SelectItem key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </>
                      )}

                      <input
                        placeholder="Notas (opcional)"
                        className={NUM_CLS}
                        value={resultForm.notes}
                        onChange={(e) => setResultForm((f) => ({ ...f, notes: e.target.value }))}
                      />

                      <div className="flex gap-2 pt-1">
                        <Button variant="outline" className="flex-1" onClick={() => setRecordingVisit(null)}>
                          Cancelar
                        </Button>
                        <Button
                          className="flex-1"
                          onClick={() => recordMutation.mutate({ visitId: visit.id, data: resultForm })}
                          disabled={recordMutation.isPending}
                        >
                          {recordMutation.isPending ? 'Guardando...' : 'Guardar'}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <RequirePermission permission="collections:collect">
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3 w-full"
                        onClick={() => {
                          setRecordingVisit(visit.id);
                          setResultForm({ result: 'COLLECTED', collectedAmount: String(visit.plannedAmount), paymentMethod: 'CASH', notes: '' });
                        }}
                      >
                        Registrar resultado
                      </Button>
                    </RequirePermission>
                  )
                ) : null}
              </div>
            ))}
          </div>
        </div>

        {/* Footer action */}
        {route.status === 'OPEN' && (
          <RequirePermission permission="collections:manage">
            <div className="border-t border-border px-5 py-4 shrink-0">
              <Button
                className="w-full"
                onClick={() => closeMutation.mutate()}
                disabled={closeMutation.isPending}
              >
                <CheckCircle2 size={15} />
                {closeMutation.isPending ? 'Cerrando...' : 'Cerrar ruta'}
              </Button>
            </div>
          </RequirePermission>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ── Create Route Modal ─────────────────────────────────────────────────────────

function CreateRouteModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [form, setForm] = useState({ routeDate: todayISODate(), notes: '' });
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => cobranzasApi.createRoute({ routeDate: form.routeDate, notes: form.notes || undefined }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['collection-routes'] });
      onOpenChange(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-md p-0">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <DialogTitle>Nueva ruta de cobranza</DialogTitle>
          <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
            <X size={18} />
          </Button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="space-y-1.5">
            <Label>Fecha de ruta</Label>
            <DatePicker
              value={form.routeDate}
              onChange={(v) => setForm((f) => ({ ...f, routeDate: v }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Notas <span className="text-muted-foreground/60">(opcional)</span></Label>
            <textarea
              rows={3}
              className={TEXTAREA_CLS}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              className="flex-1"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? 'Creando...' : 'Crear ruta'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Agreements Tab ─────────────────────────────────────────────────────────────

function AgreementsTab() {
  const { data: agreements = [], isLoading } = useQuery({
    queryKey: ['payment-agreements'],
    queryFn: () => cobranzasApi.listAgreements(),
  });

  const qc = useQueryClient();

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'FULFILLED' | 'BROKEN' | 'CANCELLED' }) =>
      cobranzasApi.updateAgreementStatus(id, status),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['payment-agreements'] }),
  });

  if (isLoading) {
    return <div className="py-16 text-center text-sm text-muted-foreground/60">Cargando...</div>;
  }

  if (agreements.length === 0) {
    return (
      <div className="py-24 text-center">
        <p className="text-sm text-muted-foreground/60">No hay acuerdos de pago registrados</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {agreements.map((ag: PaymentAgreement) => {
        const st = AGREEMENT_STATUS[ag.status];
        return (
          <Card key={ag.id} className="p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-base font-semibold text-foreground">
                  {ag.customer.firstName} {ag.customer.lastName}
                </p>
                <p className="text-xs text-muted-foreground/60 mt-0.5">CI: {ag.customer.documentNumber}</p>
              </div>
              <Badge
                variant={st.destructive ? 'destructive' : 'outline'}
                className={st.className}
              >
                {st.label}
              </Badge>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Deuda original</p>
                <p className="text-sm font-bold text-foreground mt-0.5 tabular-nums">{fmtGs(ag.originalDebt)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Cuotas acordadas</p>
                <p className="text-sm font-bold text-foreground mt-0.5 tabular-nums">
                  {ag.agreedInstallments} × {fmtGs(ag.agreedAmount)}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Inicio</p>
                <p className="text-sm font-bold text-foreground mt-0.5">{fmtDate(ag.startDate)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Registrado por</p>
                <p className="text-sm font-semibold text-foreground mt-0.5">
                  {ag.createdBy ? `${ag.createdBy.firstName} ${ag.createdBy.lastName}` : '—'}
                </p>
              </div>
            </div>

            {ag.status === 'ACTIVE' && (
              <RequirePermission permission="collections:manage">
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-accent-on/20 text-accent-on hover:bg-accent-subtle"
                  onClick={() => updateStatus.mutate({ id: ag.id, status: 'FULFILLED' })}
                  disabled={updateStatus.isPending}
                >
                  Marcar cumplido
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-destructive/30 text-destructive hover:bg-destructive/10"
                  onClick={() => updateStatus.mutate({ id: ag.id, status: 'BROKEN' })}
                  disabled={updateStatus.isPending}
                >
                  Marcar incumplido
                </Button>
              </div>
              </RequirePermission>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// ── Delinquency (Morosos) Tab ───────────────────────────────────────────────────

// Confirmar/excluir un candidato a moroso — no hay integración real con
// Informconf: "Marcar reportado" solo deja constancia en el sistema de que
// el analista lo reportó por fuera; el N° de referencia/expediente, si lo
// hay, se carga acá a mano.
function ReviewDelinquencyModal({
  report,
  action,
  onOpenChange,
}: {
  report: DelinquencyReport;
  action: 'REPORTED' | 'EXCLUDED';
  onOpenChange: (open: boolean) => void;
}) {
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: () =>
      cobranzasApi.updateDelinquencyReport(report.id, {
        status: action,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['delinquency-reports'] });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      setError(apiErrorMessage(err, 'Error al guardar'));
    },
  });

  const requiresNotes = action === 'EXCLUDED';

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-md p-0">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <DialogTitle>
            {action === 'REPORTED' ? 'Marcar como reportado a Informconf' : 'Excluir de Morosos'}
          </DialogTitle>
          <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
            <X size={18} />
          </Button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-muted-foreground">
            {report.customer.firstName} {report.customer.lastName} · {report.daysOverdue} días de mora
          </p>

          {action === 'REPORTED' && (
            <div className="space-y-1.5">
              <Label>N° de referencia / expediente <span className="text-muted-foreground/60">(opcional)</span></Label>
              <input
                type="text"
                className={NUM_CLS}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Ej: número de expediente de Informconf"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>
              Notas {requiresNotes ? '' : <span className="text-muted-foreground/60">(opcional)</span>}
            </Label>
            <textarea
              rows={3}
              className={TEXTAREA_CLS}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={requiresNotes ? 'Motivo de la exclusión' : undefined}
            />
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              className="flex-1"
              disabled={mutation.isPending || (requiresNotes && !notes.trim())}
              onClick={() => { setError(''); mutation.mutate(); }}
            >
              {mutation.isPending ? 'Guardando...' : 'Confirmar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DelinquencyTab() {
  const [statusFilter, setStatusFilter] = useState<DelinquencyReportStatus | ''>('PENDING_REVIEW');
  const [reviewing, setReviewing] = useState<{ report: DelinquencyReport; action: 'REPORTED' | 'EXCLUDED' } | null>(null);

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ['delinquency-reports', statusFilter],
    queryFn: () => cobranzasApi.listDelinquencyReports(statusFilter || undefined),
  });

  return (
    <>
      <Card className="overflow-hidden p-0">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground/60 font-medium">Estado:</span>
          {(['', 'PENDING_REVIEW', 'REPORTED', 'EXCLUDED'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                'px-3 py-1 rounded-full border text-xs font-semibold transition-colors',
                statusFilter === s
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30',
              )}
            >
              {s === '' ? 'Todos' : DELINQUENCY_STATUS[s].label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="py-16 text-center text-sm text-muted-foreground/60">Cargando...</div>
        ) : reports.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm text-muted-foreground/60">
              {statusFilter === 'PENDING_REVIEW'
                ? 'No hay candidatos por revisar — se detectan automáticamente al cruzar el umbral configurado en Financiamiento.'
                : 'No hay registros para este filtro.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/30 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <tr>
                  {['Cliente', 'Días de mora', 'Estado', 'Detectado', ''].map((h) => (
                    <th key={h} className="px-4 py-3 text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {reports.map((report) => {
                  const st = DELINQUENCY_STATUS[report.status];
                  return (
                    <tr key={report.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">{report.customer.firstName} {report.customer.lastName}</p>
                        {report.customer.documentNumber && (
                          <p className="text-xs text-muted-foreground/60">{report.customer.documentType ?? 'CI'}: {report.customer.documentNumber}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-destructive font-semibold tabular-nums">{report.daysOverdue}</td>
                      <td className="px-4 py-3">
                        <Badge variant={st.destructive ? 'destructive' : 'outline'} className={st.className}>
                          {st.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{fmtDate(report.createdAt)}</td>
                      <td className="px-4 py-3 text-right">
                        {report.status === 'PENDING_REVIEW' && (
                          <RequirePermission permission="collections:manage">
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-destructive/30 text-destructive hover:bg-destructive/10"
                                onClick={() => setReviewing({ report, action: 'REPORTED' })}
                              >
                                Marcar reportado
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setReviewing({ report, action: 'EXCLUDED' })}
                              >
                                Excluir
                              </Button>
                            </div>
                          </RequirePermission>
                        )}
                        {report.reference && (
                          <p className="text-xs text-muted-foreground/60">Ref: {report.reference}</p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {reviewing && (
        <ReviewDelinquencyModal
          report={reviewing.report}
          action={reviewing.action}
          onOpenChange={(open) => { if (!open) setReviewing(null); }}
        />
      )}
    </>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function CobranzasPage() {
  const [tab, setTab] = useState<'routes' | 'agreements' | 'delinquency'>('routes');
  const [statusFilter, setStatusFilter] = useState<string>('OPEN');
  const [panelRoute, setPanelRoute] = useState<CollectionRoute | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const { data: kpis } = useQuery({
    queryKey: ['collections-kpis'],
    queryFn: cobranzasApi.getKpis,
    refetchInterval: 60_000,
  });

  const { data: routes = [], isLoading } = useQuery({
    queryKey: ['collection-routes', statusFilter],
    queryFn: () => cobranzasApi.listRoutes({ status: statusFilter || undefined }),
    enabled: tab === 'routes',
  });

  function openPanel(route: CollectionRoute) {
    setPanelRoute(route);
    setPanelOpen(true);
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Cobranzas</h1>
          <p className="mt-1 text-sm text-muted-foreground">Gestión de rutas, visitas y acuerdos de pago</p>
        </div>
        {tab === 'routes' && (
          <RequirePermission permission="collections:manage">
            <Button onClick={() => setShowCreate(true)}>
              <MapPin size={15} />
              Nueva ruta
            </Button>
          </RequirePermission>
        )}
      </div>

      {/* KPIs */}
      {kpis && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          <KpiCard label="Rutas abiertas"    value={kpis.openRoutes} />
          <KpiCard label="Rutas hoy"         value={kpis.routesToday} />
          <KpiCard label="Acuerdos activos"  value={kpis.activeAgreements} />
          <KpiCard label="Cuotas vencidas"   value={kpis.overdueInstallments} />
          <KpiCard label="Total cobrado"     value={fmtGs(kpis.totalCollected)} sub="rutas cerradas" />
        </div>
      )}

      {/* Tabs */}
      <div className="mb-5 flex border-b border-border gap-1">
        {(['routes', 'agreements', 'delinquency'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'flex items-center gap-1.5 -mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
              tab === t ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t === 'delinquency' && <AlertOctagon size={14} />}
            {t === 'routes' ? 'Rutas' : t === 'agreements' ? 'Acuerdos de pago' : 'Morosos'}
          </button>
        ))}
      </div>

      {/* Routes tab */}
      {tab === 'routes' && (
        <Card className="overflow-hidden p-0">
          {/* Status filter */}
          <div className="px-4 py-3 border-b border-border flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground/60 font-medium">Estado:</span>
            {(['', 'OPEN', 'CLOSED', 'CANCELLED'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cn(
                  'px-3 py-1 rounded-full border text-xs font-semibold transition-colors',
                  statusFilter === s
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30',
                )}
              >
                {s === '' ? 'Todas' : ROUTE_STATUS[s as CollectionRouteStatus]?.label ?? s}
              </button>
            ))}
          </div>

          {isLoading ? (
            <div className="py-16 text-center text-sm text-muted-foreground/60">Cargando rutas...</div>
          ) : routes.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-sm text-muted-foreground/60">No hay rutas para este filtro</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/30 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <tr>
                    {['Fecha', 'Cobrador', 'Estado', 'Visitas', 'Progreso', 'Montos'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {routes.map((route) => {
                    const st = ROUTE_STATUS[route.status];
                    const pct = route.totalPlanned > 0
                      ? Math.min(100, (route.totalCollected / route.totalPlanned) * 100)
                      : 0;
                    return (
                      <tr
                        key={route.id}
                        onClick={() => openPanel(route)}
                        className="cursor-pointer hover:bg-muted/20 transition-colors"
                      >
                        <td className="px-4 py-3 font-medium text-foreground">{fmtDate(route.routeDate)}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {route.collector
                            ? `${route.collector.firstName} ${route.collector.lastName}`
                            : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            variant={st.destructive ? 'destructive' : 'outline'}
                            className={st.className}
                          >
                            {st.label}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{route.visits.length} visitas</td>
                        <td className="px-4 py-3 min-w-[140px]">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 rounded-full bg-muted/20">
                              <div
                                className="h-1.5 rounded-full bg-emerald-500 transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground/60 tabular-nums w-8">{Math.round(pct)}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-foreground">
                          <span className="text-emerald-600">{fmtGs(route.totalCollected)}</span>
                          <span className="text-muted-foreground/60 mx-1">/</span>
                          {fmtGs(route.totalPlanned)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Agreements tab */}
      {tab === 'agreements' && <AgreementsTab />}

      {/* Delinquency (Morosos) tab */}
      {tab === 'delinquency' && <DelinquencyTab />}

      {/* Detail panel */}
      {panelRoute && (
        <RouteDetailPanel
          route={panelRoute}
          open={panelOpen}
          onOpenChange={(open) => {
            setPanelOpen(open);
          }}
        />
      )}

      {/* Create modal */}
      <CreateRouteModal open={showCreate} onOpenChange={setShowCreate} />
    </div>
  );
}
