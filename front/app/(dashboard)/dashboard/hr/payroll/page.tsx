'use client';

import { apiErrorMessage } from '@/lib/api/api-error';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Play, CheckCircle, ChevronDown, ChevronRight, Settings, Users2, LayoutGrid, Receipt } from 'lucide-react';
import { hrApi, type PayrollRecord, type PayrollRecordItem } from '../../../../../lib/api/hr';
import { NumericInput } from '../../../../../components/numeric-input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

const NUM_CLS = 'h-9 w-full min-w-0 rounded-3xl border border-transparent bg-input/50 px-3 text-sm outline-none transition-[color,box-shadow,background-color] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30';

function HrNav({ active }: { active: 'employees' | 'areas' | 'payroll' }) {
  const links = [
    { key: 'employees', label: 'Empleados',      href: '/dashboard/hr',         icon: Users2 },
    { key: 'areas',     label: 'Áreas y cargos', href: '/dashboard/hr/areas',   icon: LayoutGrid },
    { key: 'payroll',   label: 'Nómina',          href: '/dashboard/hr/payroll', icon: Receipt },
  ] as const;

  return (
    <div className="flex gap-1 border-b border-border mb-6">
      {links.map(({ key, label, href, icon: Icon }) => (
        <Link
          key={key}
          href={href}
          className={cn(
            'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px',
            active === key
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          <Icon size={15} />
          {label}
        </Link>
      ))}
    </div>
  );
}

const STATUS_LABELS: Record<string, string> = {
  PENDING:   'Borrador',
  PROCESSED: 'Procesado',
  PAID:      'Pagado',
};

function StatusBadge({ status }: { status: string }) {
  if (status === 'PAID') {
    return <Badge variant="outline" className="bg-accent-subtle text-accent-on border-accent-on/20">{STATUS_LABELS[status] ?? status}</Badge>;
  }
  if (status === 'PROCESSED') {
    return <Badge variant="outline" className="bg-warn-subtle text-warn border-warn/30">{STATUS_LABELS[status] ?? status}</Badge>;
  }
  return <Badge variant="outline" className="bg-muted/30 text-muted-foreground border-border">{STATUS_LABELS[status] ?? status}</Badge>;
}

function formatPYG(n: number) {
  return new Intl.NumberFormat('es-PY', { style: 'currency', currency: 'PYG', maximumFractionDigits: 0 }).format(n);
}

// ── Config panel ───────────────────────────────────────────────────────────────

function ConfigPanel() {
  const queryClient = useQueryClient();
  const { data: config, isLoading } = useQuery({ queryKey: ['hr-payroll-config'], queryFn: hrApi.getPayrollConfig });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ minimumWage: 0, ipsEmployeeRate: 0.09, ipsEmployerRate: 0.165 });
  const [saved, setSaved] = useState(false);

  const saveMutation = useMutation({
    mutationFn: () => hrApi.updatePayrollConfig(form),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['hr-payroll-config'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  function handleOpen() {
    if (!open && config) {
      setForm({
        minimumWage:    config.minimumWage,
        ipsEmployeeRate: config.ipsEmployeeRate,
        ipsEmployerRate: config.ipsEmployerRate,
      });
    }
    setOpen((v) => !v);
  }

  if (isLoading) return null;

  return (
    <div className="mb-6 rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={handleOpen}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <Settings size={16} />
          Parámetros de nómina
        </div>
        {open
          ? <ChevronDown size={15} className="text-muted-foreground/60" />
          : <ChevronRight size={15} className="text-muted-foreground/60" />}
      </button>

      {open && (
        <div className="border-t border-border px-5 pb-5">
          <div className="mt-4 grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Salario mínimo (PYG)</Label>
              <NumericInput
                value={form.minimumWage}
                onChange={(v) => setForm((f) => ({ ...f, minimumWage: Math.round(v) }))}
                className={NUM_CLS}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Aporte IPS empleado (%)</Label>
              <input
                type="number"
                min={0}
                max={1}
                step={0.001}
                className={NUM_CLS}
                value={form.ipsEmployeeRate}
                onChange={(e) => setForm((f) => ({ ...f, ipsEmployeeRate: parseFloat(e.target.value) || 0 }))}
              />
              <p className="text-xs text-muted-foreground/60">Default: 0.09 (9%)</p>
            </div>
            <div className="space-y-1.5">
              <Label>Aporte IPS empleador (%)</Label>
              <input
                type="number"
                min={0}
                max={1}
                step={0.001}
                className={NUM_CLS}
                value={form.ipsEmployerRate}
                onChange={(e) => setForm((f) => ({ ...f, ipsEmployerRate: parseFloat(e.target.value) || 0 }))}
              />
              <p className="text-xs text-muted-foreground/60">Default: 0.165 (16.5%)</p>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              size="sm"
            >
              {saveMutation.isPending ? 'Guardando...' : 'Guardar parámetros'}
            </Button>
            {saved && <span className="text-sm text-emerald-600">Guardado</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Record detail ──────────────────────────────────────────────────────────────

function RecordDetail({ record, onPay }: { record: PayrollRecord; onPay: (id: string) => void }) {
  const { data: detail, isLoading } = useQuery({
    queryKey: ['hr-payroll-record', record.id],
    queryFn: () => hrApi.getPayrollRecord(record.id),
  });

  if (isLoading) return <div className="py-4 text-center text-xs text-muted-foreground/60">Cargando detalle...</div>;
  if (!detail?.items?.length) return <div className="py-4 text-center text-xs text-muted-foreground/60">Sin items</div>;

  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-border">
      <table className="w-full text-xs">
        <thead className="border-b border-border bg-muted/30 text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left">Empleado</th>
            <th className="px-3 py-2 text-right">Salario bruto</th>
            <th className="px-3 py-2 text-right">IPS empleado</th>
            <th className="px-3 py-2 text-right">Aguinaldo</th>
            <th className="px-3 py-2 text-right">Neto</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {detail.items.map((item: PayrollRecordItem) => (
            <tr key={item.id}>
              <td className="px-3 py-2 text-muted-foreground">
                #{String(item.employee.employeeNumber).padStart(4, '0')} {item.employee.firstName} {item.employee.lastName}
              </td>
              <td className="px-3 py-2 text-right font-mono text-muted-foreground">{formatPYG(item.grossSalary)}</td>
              <td className="px-3 py-2 text-right font-mono text-destructive">-{formatPYG(item.ipsEmployee)}</td>
              <td className="px-3 py-2 text-right font-mono text-amber-600">{formatPYG(item.aguinaldo)}</td>
              <td className="px-3 py-2 text-right font-mono font-semibold text-foreground">{formatPYG(item.netSalary)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {record.status === 'PENDING' && (
        <div className="border-t border-border px-3 py-2">
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => onPay(record.id)}>
            <CheckCircle size={13} />
            Marcar como pagada
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function HrPayrollPage() {
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [runError, setRunError] = useState('');

  const { data: records = [], isLoading } = useQuery({
    queryKey: ['hr-payroll-records'],
    queryFn: hrApi.listPayrollRecords,
  });

  const runMutation = useMutation({
    mutationFn: () => hrApi.runPayroll(period),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['hr-payroll-records'] });
      setRunError('');
      setExpandedId(data.id);
    },
    onError: (err: Error) => {
      setRunError(apiErrorMessage(err, 'Error al liquidar nómina'));
    },
  });

  const payMutation = useMutation({
    mutationFn: (id: string) => hrApi.markPaid(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['hr-payroll-records'] });
      void queryClient.invalidateQueries({ queryKey: ['hr-payroll-record', payMutation.variables] });
    },
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">RRHH</h1>
        <p className="mt-1 text-sm text-muted-foreground">Gestión de empleados, áreas y nómina</p>
      </div>

      <HrNav active="payroll" />

      <ConfigPanel />

      {/* Run payroll */}
      <div className="mb-6 flex items-start gap-3 rounded-xl border border-border bg-card p-5">
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">Liquidar nómina</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Calcula sueldos, IPS y aguinaldo (diciembre) para todos los empleados activos del período.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <input
            type="month"
            className={NUM_CLS}
            style={{ width: '160px' }}
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          />
          <Button
            onClick={() => { setRunError(''); runMutation.mutate(); }}
            disabled={runMutation.isPending}
            size="sm"
          >
            <Play size={14} />
            {runMutation.isPending ? 'Liquidando...' : 'Liquidar'}
          </Button>
        </div>
      </div>
      {runError && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {runError}
        </div>
      )}

      {/* Records list */}
      {isLoading ? (
        <div className="py-10 text-center text-sm text-muted-foreground/60">Cargando historial...</div>
      ) : records.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground/60">No hay liquidaciones generadas.</div>
      ) : (
        <div className="space-y-3">
          {records.map((rec: PayrollRecord) => (
            <div key={rec.id} className="rounded-xl border border-border bg-card">
              <button
                type="button"
                onClick={() => setExpandedId(expandedId === rec.id ? null : rec.id)}
                className="flex w-full items-center justify-between px-5 py-4"
              >
                <div className="flex items-center gap-4">
                  <span className="font-mono text-sm font-semibold text-foreground">{rec.period}</span>
                  <StatusBadge status={rec.status} />
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground/60">Total neto</p>
                    <p className="font-mono text-sm font-semibold text-foreground">{formatPYG(rec.totalNet)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground/60">IPS empleador</p>
                    <p className="font-mono text-sm text-muted-foreground">{formatPYG(rec.totalIpsEmployer)}</p>
                  </div>
                  {expandedId === rec.id
                    ? <ChevronDown size={15} className="text-muted-foreground/60" />
                    : <ChevronRight size={15} className="text-muted-foreground/60" />}
                </div>
              </button>

              {expandedId === rec.id && (
                <div className="border-t border-border px-5 pb-4">
                  <RecordDetail record={rec} onPay={(id) => payMutation.mutate(id)} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
