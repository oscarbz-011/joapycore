'use client';

import { RequirePermission } from '@/components/require-permission';

import { HrNav } from './_nav';

import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Plus, Pencil } from 'lucide-react';
import { hrApi, type Employee } from '../../../../lib/api/hr';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

// ── Label helpers ──────────────────────────────────────────────────────────────

const CONTRACT_LABELS: Record<string, string> = {
  PERMANENT: 'Permanente',
  TEMPORARY: 'Temporal',
  PART_TIME: 'Medio tiempo',
  CONTRACTOR: 'Contratista',
};

const DOC_LABELS: Record<string, string> = {
  CI: 'C.I.',
  RUC: 'RUC',
  PASSPORT: 'Pasaporte',
};

// ── Sub-nav ────────────────────────────────────────────────────────────────────

// ── Status badge ───────────────────────────────────────────────────────────────

function StatusBadge({ isActive, terminationDate }: { isActive: boolean; terminationDate?: string | null }) {
  if (!isActive || terminationDate) {
    return <Badge variant="destructive">Baja</Badge>;
  }
  return (
    <Badge variant="outline" className="bg-accent-subtle text-accent-on border-accent-on/20">
      Activo
    </Badge>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function HrEmployeesPage() {
  const router = useRouter();

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['hr-employees'],
    queryFn: hrApi.listEmployees,
  });

  function formatSalary(n: number) {
    return new Intl.NumberFormat('es-PY', { style: 'currency', currency: 'PYG', maximumFractionDigits: 0 }).format(n);
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">RRHH</h1>
          <p className="mt-1 text-sm text-muted-foreground">Gestión de empleados, áreas y nómina</p>
        </div>
        <RequirePermission permission="hr:employees:create">
          <Button onClick={() => router.push('/dashboard/hr/new')}>
            <Plus size={16} />
            Nuevo empleado
          </Button>
        </RequirePermission>
      </div>

      <HrNav active="employees" />

      {isLoading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">Cargando empleados...</div>
      ) : employees.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm text-muted-foreground">No hay empleados registrados.</p>
          <RequirePermission permission="hr:employees:create">
            <button
              onClick={() => router.push('/dashboard/hr/new')}
              className="mt-3 text-sm font-medium text-foreground underline underline-offset-2"
            >
              Crear el primero
            </button>
          </RequirePermission>
        </div>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/30 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">Nro.</th>
                  <th className="px-4 py-3 text-left">Código</th>
                  <th className="px-4 py-3 text-left">Empleado</th>
                  <th className="px-4 py-3 text-left">Documento</th>
                  <th className="px-4 py-3 text-left">Área</th>
                  <th className="px-4 py-3 text-left">Cargo</th>
                  <th className="px-4 py-3 text-left">Sucursal</th>
                  <th className="px-4 py-3 text-right">Salario base</th>
                  <th className="px-4 py-3 text-left">Contrato</th>
                  <th className="px-4 py-3 text-left">Estado</th>
                  <th className="px-4 py-3 text-left"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {employees.map((emp: Employee) => (
                  <tr key={emp.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      #{String(emp.employeeNumber).padStart(4, '0')}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {emp.employeeCode ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">
                        {emp.firstName} {emp.lastName}
                      </div>
                      {emp.user && (
                        <div className="text-xs text-muted-foreground/60">{emp.user.email}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <span className="text-xs text-muted-foreground/60">{DOC_LABELS[emp.documentType] ?? emp.documentType} </span>
                      {emp.documentNumber}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{emp.area?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{emp.position?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{emp.branch?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-muted-foreground">
                      {formatSalary(emp.baseSalary)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {CONTRACT_LABELS[emp.contractType] ?? emp.contractType}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge isActive={emp.isActive} terminationDate={emp.terminationDate} />
                    </td>
                    <td className="px-4 py-3">
                      <RequirePermission permission="hr:employees:update">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => router.push(`/dashboard/hr/${emp.id}/edit`)}
                          title="Editar empleado"
                          className="h-7 w-7"
                        >
                          <Pencil size={14} />
                        </Button>
                      </RequirePermission>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
