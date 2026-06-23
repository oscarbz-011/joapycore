'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Play, CheckCircle, ChevronDown, ChevronRight, Settings, Users2, LayoutGrid, Receipt } from 'lucide-react';
import { hrApi, type PayrollRecord, type PayrollRecordItem } from '../../../../../lib/api/hr';

function HrNav({ active }: { active: 'employees' | 'areas' | 'payroll' }) {
  const links = [
    { key: 'employees', label: 'Empleados', href: '/dashboard/hr', icon: Users2 },
    { key: 'areas', label: 'Áreas y cargos', href: '/dashboard/hr/areas', icon: LayoutGrid },
    { key: 'payroll', label: 'Nómina', href: '/dashboard/hr/payroll', icon: Receipt },
  ] as const;

  return (
    <div className="flex gap-1 border-b border-slate-200 mb-6">
      {links.map(({ key, label, href, icon: Icon }) => (
        <Link
          key={key}
          href={href}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
            active === key
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Icon size={15} />
          {label}
        </Link>
      ))}
    </div>
  );
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Borrador',
  PROCESSED: 'Procesado',
  PAID: 'Pagado',
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-slate-100 text-slate-600',
  PROCESSED: 'bg-amber-50 text-amber-700',
  PAID: 'bg-emerald-50 text-emerald-700',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[status] ?? 'bg-slate-100 text-slate-600'}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
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
        minimumWage: config.minimumWage,
        ipsEmployeeRate: config.ipsEmployeeRate,
        ipsEmployerRate: config.ipsEmployerRate,
      });
    }
    setOpen((v) => !v);
  }

  if (isLoading) return null;

  return (
    <div className="mb-6 rounded-xl border border-slate-200 bg-white">
      <button
        onClick={handleOpen}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Settings size={16} />
          Parámetros de nómina
        </div>
        {open ? <ChevronDown size={15} className="text-slate-400" /> : <ChevronRight size={15} className="text-slate-400" />}
      </button>

      {open && (
        <div className="border-t border-slate-100 px-5 pb-5">
          <div className="mt-4 grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Salario mínimo (PYG)</label>
              <input
                type="number"
                min={0}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                value={form.minimumWage}
                onChange={(e) => setForm((f) => ({ ...f, minimumWage: parseFloat(e.target.value) || 0 }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Aporte IPS empleado (%)</label>
              <input
                type="number"
                min={0}
                max={1}
                step={0.001}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                value={form.ipsEmployeeRate}
                onChange={(e) => setForm((f) => ({ ...f, ipsEmployeeRate: parseFloat(e.target.value) || 0 }))}
              />
              <p className="mt-0.5 text-xs text-slate-400">Default: 0.09 (9%)</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Aporte IPS empleador (%)</label>
              <input
                type="number"
                min={0}
                max={1}
                step={0.001}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                value={form.ipsEmployerRate}
                onChange={(e) => setForm((f) => ({ ...f, ipsEmployerRate: parseFloat(e.target.value) || 0 }))}
              />
              <p className="mt-0.5 text-xs text-slate-400">Default: 0.165 (16.5%)</p>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {saveMutation.isPending ? 'Guardando...' : 'Guardar parámetros'}
            </button>
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

  if (isLoading) return <div className="py-4 text-center text-xs text-slate-400">Cargando detalle...</div>;
  if (!detail?.items?.length) return <div className="py-4 text-center text-xs text-slate-400">Sin items</div>;

  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-slate-100">
      <table className="w-full text-xs">
        <thead className="border-b border-slate-100 bg-slate-50 text-slate-500">
          <tr>
            <th className="px-3 py-2 text-left">Empleado</th>
            <th className="px-3 py-2 text-right">Salario bruto</th>
            <th className="px-3 py-2 text-right">IPS empleado</th>
            <th className="px-3 py-2 text-right">Aguinaldo</th>
            <th className="px-3 py-2 text-right">Neto</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {detail.items.map((item: PayrollRecordItem) => (
            <tr key={item.id}>
              <td className="px-3 py-2 text-slate-700">
                #{String(item.employee.employeeNumber).padStart(4, '0')} {item.employee.firstName} {item.employee.lastName}
              </td>
              <td className="px-3 py-2 text-right font-mono text-slate-600">{formatPYG(item.grossSalary)}</td>
              <td className="px-3 py-2 text-right font-mono text-red-600">-{formatPYG(item.ipsEmployee)}</td>
              <td className="px-3 py-2 text-right font-mono text-amber-600">{formatPYG(item.aguinaldo)}</td>
              <td className="px-3 py-2 text-right font-mono font-semibold text-slate-800">{formatPYG(item.netSalary)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {record.status === 'PENDING' && (
        <div className="border-t border-slate-100 px-3 py-2">
          <button
            onClick={() => onPay(record.id)}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
          >
            <CheckCircle size={13} />
            Marcar como pagada
          </button>
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
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      setRunError(err?.response?.data?.message ?? 'Error al liquidar nómina');
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
        <h1 className="text-2xl font-semibold text-slate-900">RRHH</h1>
        <p className="mt-1 text-sm text-slate-500">Gestión de empleados, áreas y nómina</p>
      </div>

      <HrNav active="payroll" />

      <ConfigPanel />

      {/* Run payroll */}
      <div className="mb-6 flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex-1">
          <p className="text-sm font-semibold text-slate-900">Liquidar nómina</p>
          <p className="mt-0.5 text-xs text-slate-500">
            Calcula sueldos, IPS y aguinaldo (diciembre) para todos los empleados activos del período.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <input
            type="month"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          />
          <button
            onClick={() => {
              setRunError('');
              runMutation.mutate();
            }}
            disabled={runMutation.isPending}
            className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            <Play size={14} />
            {runMutation.isPending ? 'Liquidando...' : 'Liquidar'}
          </button>
        </div>
      </div>
      {runError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {runError}
        </div>
      )}

      {/* Records list */}
      {isLoading ? (
        <div className="py-10 text-center text-sm text-slate-400">Cargando historial...</div>
      ) : records.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-400">No hay liquidaciones generadas.</div>
      ) : (
        <div className="space-y-3">
          {records.map((rec: PayrollRecord) => (
            <div key={rec.id} className="rounded-xl border border-slate-200 bg-white">
              <button
                onClick={() => setExpandedId(expandedId === rec.id ? null : rec.id)}
                className="flex w-full items-center justify-between px-5 py-4"
              >
                <div className="flex items-center gap-4">
                  <span className="font-mono text-sm font-semibold text-slate-900">{rec.period}</span>
                  <StatusBadge status={rec.status} />
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="text-xs text-slate-400">Total neto</p>
                    <p className="font-mono text-sm font-semibold text-slate-800">{formatPYG(rec.totalNet)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-400">IPS empleador</p>
                    <p className="font-mono text-sm text-slate-600">{formatPYG(rec.totalIpsEmployer)}</p>
                  </div>
                  {expandedId === rec.id
                    ? <ChevronDown size={15} className="text-slate-400" />
                    : <ChevronRight size={15} className="text-slate-400" />}
                </div>
              </button>

              {expandedId === rec.id && (
                <div className="border-t border-slate-100 px-5 pb-4">
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
