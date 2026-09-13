'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Check, Pencil, Plus, X } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/api-error';
import {
  hrApi,
  type Leave,
  type LeaveStatus,
  type LeaveType,
} from '@/lib/api/hr';
import { useAuth } from '@/lib/auth-context';
import { formatDatePY } from '@/lib/date';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { HrNav } from '../_nav';

const TYPE_LABEL: Record<LeaveType, string> = {
  VACATION: 'Vacaciones',
  SICK: 'Enfermedad',
  MATERNITY: 'Maternidad',
  PATERNITY: 'Paternidad',
  PERSONAL: 'Personal',
  OTHER: 'Otra',
};

const STATUS_LABEL: Record<LeaveStatus, string> = {
  PENDING: 'Pendiente',
  APPROVED: 'Aprobada',
  REJECTED: 'Rechazada',
  CANCELLED: 'Cancelada',
};

const STATUS_CLS: Record<LeaveStatus, string> = {
  PENDING: 'bg-warn-subtle text-warn border-warn/30',
  APPROVED: 'bg-accent-subtle text-accent-on border-accent-on/20',
  REJECTED: 'bg-destructive/10 text-destructive border-destructive/30',
  CANCELLED: 'bg-muted/30 text-muted-foreground border-border',
};

const ALL = 'all';

export default function LeavesPage() {
  const { jwtPayload } = useAuth();
  const canManage = jwtPayload?.permissions.includes('hr:leaves:manage') ?? false;
  const qc = useQueryClient();

  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [status, setStatus] = useState<LeaveStatus | typeof ALL>(ALL);
  const [employeeId, setEmployeeId] = useState<string>(ALL);
  const [showNew, setShowNew] = useState(false);
  const [actionError, setActionError] = useState('');

  const { data: employees = [] } = useQuery({
    queryKey: ['hr-employees'],
    queryFn: hrApi.listEmployees,
  });
  const activeEmployees = employees.filter((e) => e.isActive && !e.terminationDate);

  const { data: leaves = [], isLoading } = useQuery({
    queryKey: ['hr-leaves', year, status, employeeId],
    queryFn: () =>
      hrApi.listLeaves({
        year,
        ...(status !== ALL ? { status } : {}),
        ...(employeeId !== ALL ? { employeeId } : {}),
      }),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['hr-leaves'] });
    void qc.invalidateQueries({ queryKey: ['hr-leave-balance'] });
  };

  const actionMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'reject' | 'cancel' }) =>
      action === 'approve'
        ? hrApi.approveLeave(id)
        : action === 'reject'
          ? hrApi.rejectLeave(id)
          : hrApi.cancelLeave(id),
    onSuccess: () => {
      setActionError('');
      invalidate();
    },
    onError: (err) => setActionError(apiErrorMessage(err, 'No se pudo actualizar la licencia')),
  });

  const employeeName = (id: string) => {
    const e = employees.find((x) => x.id === id);
    return e ? `${e.firstName} ${e.lastName}` : 'Todos los empleados';
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">RRHH</h1>
          <p className="mt-1 text-sm text-muted-foreground">Licencias y vacaciones del personal</p>
        </div>
        {canManage && (
          <Button onClick={() => setShowNew(true)}>
            <Plus size={16} />
            Nueva licencia
          </Button>
        )}
      </div>

      <HrNav active="leaves" />

      <div className="mb-4 flex flex-wrap gap-2">
        <Select value={String(year)} onValueChange={(v) => v && setYear(Number(v))}>
          <SelectTrigger className="w-28">
            <span className="flex-1 text-left text-sm">{year}</span>
          </SelectTrigger>
          <SelectContent>
            {[thisYear + 1, thisYear, thisYear - 1, thisYear - 2].map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={status} onValueChange={(v) => v && setStatus(v as LeaveStatus | typeof ALL)}>
          <SelectTrigger className="w-40">
            <span className="flex-1 text-left text-sm">
              {status === ALL ? 'Todos los estados' : STATUS_LABEL[status]}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos los estados</SelectItem>
            {(Object.keys(STATUS_LABEL) as LeaveStatus[]).map((s) => (
              <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={employeeId} onValueChange={(v) => v && setEmployeeId(v)}>
          <SelectTrigger className="w-60">
            <span className="min-w-0 flex-1 truncate text-left text-sm">{employeeName(employeeId)}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos los empleados</SelectItem>
            {employees.map((e) => (
              <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {employeeId !== ALL && (
        <BalanceCard employeeId={employeeId} year={year} canManage={canManage} />
      )}

      {actionError && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {actionError}
        </div>
      )}

      {isLoading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">Cargando licencias...</div>
      ) : leaves.length === 0 ? (
        <div className="py-16 text-center">
          <CalendarDays size={22} className="mx-auto text-muted-foreground/40" />
          <p className="mt-2 text-sm text-muted-foreground">No hay licencias con estos filtros.</p>
        </div>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/30 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">Empleado</th>
                  <th className="px-4 py-3 text-left">Tipo</th>
                  <th className="px-4 py-3 text-left">Desde</th>
                  <th className="px-4 py-3 text-left">Hasta</th>
                  <th className="px-4 py-3 text-right">Días hábiles</th>
                  <th className="px-4 py-3 text-left">Estado</th>
                  <th className="px-4 py-3 text-left">Aprobó</th>
                  {canManage && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {leaves.map((leave) => (
                  <LeaveRow
                    key={leave.id}
                    leave={leave}
                    canManage={canManage}
                    busy={actionMutation.isPending}
                    onAction={(action) => actionMutation.mutate({ id: leave.id, action })}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {showNew && (
        <NewLeaveDialog
          employees={activeEmployees}
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setShowNew(false);
            invalidate();
          }}
        />
      )}
    </div>
  );
}

function LeaveRow({
  leave,
  canManage,
  busy,
  onAction,
}: {
  leave: Leave;
  canManage: boolean;
  busy: boolean;
  onAction: (action: 'approve' | 'reject' | 'cancel') => void;
}) {
  return (
    <tr className="hover:bg-muted/20">
      <td className="px-4 py-3">
        <p className="font-medium text-foreground">
          {leave.employee.firstName} {leave.employee.lastName}
        </p>
        {leave.notes && <p className="max-w-64 truncate text-xs text-muted-foreground">{leave.notes}</p>}
      </td>
      <td className="px-4 py-3">{TYPE_LABEL[leave.type]}</td>
      <td className="px-4 py-3 tabular-nums">{formatDatePY(leave.startDate)}</td>
      <td className="px-4 py-3 tabular-nums">{formatDatePY(leave.endDate)}</td>
      <td className="px-4 py-3 text-right tabular-nums">{leave.days}</td>
      <td className="px-4 py-3">
        <Badge variant="outline" className={STATUS_CLS[leave.status]}>
          {STATUS_LABEL[leave.status]}
        </Badge>
      </td>
      <td className="px-4 py-3 text-muted-foreground">
        {leave.approvedBy ? `${leave.approvedBy.firstName} ${leave.approvedBy.lastName}` : '—'}
      </td>
      {canManage && (
        <td className="px-4 py-3">
          <div className="flex justify-end gap-1">
            {leave.status === 'PENDING' && (
              <>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => onAction('approve')}>
                  <Check size={14} /> Aprobar
                </Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => onAction('reject')}>
                  <X size={14} /> Rechazar
                </Button>
              </>
            )}
            {(leave.status === 'PENDING' || leave.status === 'APPROVED') && (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => onAction('cancel')}>
                Cancelar
              </Button>
            )}
          </div>
        </td>
      )}
    </tr>
  );
}

function BalanceCard({
  employeeId,
  year,
  canManage,
}: {
  employeeId: string;
  year: number;
  canManage: boolean;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [entitled, setEntitled] = useState('');
  const [error, setError] = useState('');

  const { data: balance } = useQuery({
    queryKey: ['hr-leave-balance', employeeId, year],
    queryFn: () => hrApi.getLeaveBalance(employeeId, year),
  });

  const saveMutation = useMutation({
    mutationFn: () => hrApi.setLeaveBalance(employeeId, year, Number(entitled)),
    onSuccess: () => {
      setEditing(false);
      setError('');
      void qc.invalidateQueries({ queryKey: ['hr-leave-balance', employeeId, year] });
    },
    onError: (err) => setError(apiErrorMessage(err, 'No se pudo guardar el saldo')),
  });

  if (!balance) return null;

  const stats = [
    { label: 'Corresponden', value: balance.entitled },
    { label: 'Tomados', value: balance.taken },
    { label: 'Pendientes', value: balance.pending },
    { label: 'Disponibles', value: balance.available },
  ];

  return (
    <Card className="mb-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium text-foreground">Vacaciones {year} (días hábiles)</p>
        {canManage && !editing && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setEntitled(String(balance.entitled));
              setEditing(true);
            }}
          >
            <Pencil size={13} /> Ajustar
          </Button>
        )}
      </div>
      {editing ? (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Días que corresponden</Label>
            <Input
              type="number"
              min={0}
              max={365}
              value={entitled}
              onChange={(e) => setEntitled(e.target.value)}
              className="w-28"
            />
          </div>
          <Button size="sm" disabled={saveMutation.isPending || entitled === ''} onClick={() => saveMutation.mutate()}>
            Guardar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancelar
          </Button>
          {error && <p className="w-full text-xs text-destructive">{error}</p>}
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label}>
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="text-lg font-semibold tabular-nums text-foreground">{s.value}</p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function NewLeaveDialog({
  employees,
  onClose,
  onCreated,
}: {
  employees: { id: string; firstName: string; lastName: string }[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [employeeId, setEmployeeId] = useState('');
  const [type, setType] = useState<LeaveType>('VACATION');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      hrApi.requestLeave({
        employeeId,
        type,
        startDate,
        endDate,
        notes: notes.trim() || undefined,
      }),
    onSuccess: onCreated,
    onError: (err) => setError(apiErrorMessage(err, 'No se pudo registrar la licencia')),
  });

  const selected = employees.find((e) => e.id === employeeId);
  const canSubmit = !!employeeId && !!startDate && !!endDate && !mutation.isPending;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nueva licencia</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError('');
            mutation.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label>Empleado</Label>
            <Select value={employeeId || 'none'} onValueChange={(v) => setEmployeeId(v && v !== 'none' ? v : '')}>
              <SelectTrigger className="w-full">
                <span className="min-w-0 flex-1 truncate text-left text-sm">
                  {selected ? `${selected.firstName} ${selected.lastName}` : 'Seleccionar empleado…'}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Seleccionar empleado…</SelectItem>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={type} onValueChange={(v) => v && setType(v as LeaveType)}>
              <SelectTrigger className="w-full">
                <span className="flex-1 text-left text-sm">{TYPE_LABEL[type]}</span>
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(TYPE_LABEL) as LeaveType[]).map((t) => (
                  <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {type === 'VACATION' && (
              <p className="text-xs text-muted-foreground">
                Descuenta del saldo anual. Se cuentan días hábiles de lunes a sábado.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Desde</Label>
              <DatePicker value={startDate} onChange={setStartDate} />
            </div>
            <div className="space-y-1.5">
              <Label>Hasta</Label>
              <DatePicker value={endDate} onChange={setEndDate} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Notas</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {mutation.isPending ? 'Guardando…' : 'Registrar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
