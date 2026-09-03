'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, X, Search } from 'lucide-react';
import { auditApi, type AuditLog, type AuditFilters } from '../../../../../lib/api/audit';
import { DatePicker } from '@/components/ui/date-picker';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';

// ── Constants ─────────────────────────────────────────────────────────────────

const MODULE_OPTIONS = [
  'sales', 'inventory', 'billing', 'procurement',
  'payments', 'hr', 'users', 'tenants', 'branches', 'auth',
];

const MODULE_LABELS: Record<string, string> = {
  sales: 'Ventas', inventory: 'Inventario', billing: 'Facturación',
  procurement: 'Compras', payments: 'Pagos', hr: 'RRHH',
  users: 'Usuarios', tenants: 'Mi Empresa', branches: 'Sucursales', auth: 'Autenticación',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('es-PY', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function actionLabel(action: string) {
  return action.replace(/\./g, ' › ');
}

// ── Detail panel ──────────────────────────────────────────────────────────────

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined) return null;
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <pre className="overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs text-emerald-400 leading-relaxed">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function DetailPanel({ log, onClose }: { log: AuditLog; onClose: () => void }) {
  const field = (label: string, value: string | null | undefined) =>
    value ? (
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm text-foreground">{value}</p>
      </div>
    ) : null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-foreground">{actionLabel(log.action)}</p>
          <p className="text-xs text-muted-foreground/60">{formatDate(log.createdAt)}</p>
        </div>
        <button onClick={onClose} className="rounded-md p-1 text-muted-foreground/60 hover:bg-muted/20">
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {field('Módulo', MODULE_LABELS[log.module] ?? log.module)}
          {field('Recurso ID', log.resourceId)}
          {field(
            'Usuario',
            log.user ? `${log.user.firstName} ${log.user.lastName}` : '—',
          )}
          {field('Email', log.user?.email ?? '—')}
          {field('IP', log.ipAddress)}
        </div>

        <JsonBlock label="Estado anterior" value={log.before} />
        <JsonBlock label="Estado nuevo" value={log.after} />
      </div>
    </div>
  );
}

// ── Filters bar ───────────────────────────────────────────────────────────────

function FiltersBar({
  filters,
  onChange,
}: {
  filters: AuditFilters;
  onChange: (f: AuditFilters) => void;
}) {
  const inputCls =
    'rounded-lg border border-border bg-card text-foreground px-3 py-1.5 text-sm focus:border-ring focus:outline-none';

  return (
    <div className="flex flex-wrap gap-2">
      <div className="relative">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/60" />
        <input
          className={`${inputCls} pl-8 w-44`}
          placeholder="Buscar acción…"
          value={filters.action ?? ''}
          onChange={(e) => onChange({ ...filters, action: e.target.value || undefined, page: 1 })}
        />
      </div>

      <Select value={filters.module || 'all'} onValueChange={(v) => onChange({ ...filters, module: v && v !== 'all' ? v : undefined, page: 1 })}>
        <SelectTrigger>
          <span className="min-w-0 flex-1 truncate text-left text-sm">{filters.module ? (MODULE_LABELS[filters.module] ?? filters.module) : 'Todos los módulos'}</span>
        </SelectTrigger>
        <SelectContent className="w-auto min-w-[9rem]">
          <SelectItem value="all">Todos los módulos</SelectItem>
          {MODULE_OPTIONS.map((m) => (
            <SelectItem key={m} value={m}>{MODULE_LABELS[m] ?? m}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <DatePicker
        value={filters.dateFrom ?? ''}
        onChange={(v) => onChange({ ...filters, dateFrom: v || undefined, page: 1 })}
      />
      <DatePicker
        value={filters.dateTo ?? ''}
        onChange={(v) => onChange({ ...filters, dateTo: v || undefined, page: 1 })}
      />

      {(filters.module || filters.action || filters.dateFrom || filters.dateTo) && (
        <button
          onClick={() => onChange({ page: 1, limit: filters.limit })}
          className="rounded-lg border border-border bg-card text-muted-foreground px-3 py-1.5 text-sm hover:bg-muted/20"
        >
          Limpiar
        </button>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AuditPage() {
  const [filters, setFilters] = useState<AuditFilters>({ page: 1, limit: 50 });
  const [selected, setSelected] = useState<AuditLog | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', filters],
    queryFn: () => auditApi.getLogs(filters),
    placeholderData: (prev) => prev,
  });

  const logs = data?.data ?? [];
  const totalPages = data?.totalPages ?? 1;
  const page = data?.page ?? 1;

  function handleSelect(log: AuditLog) {
    setSelected((prev) => (prev?.id === log.id ? null : log));
  }

  const panelOpen = selected !== null;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Auditoría</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Registro de todas las acciones realizadas en el sistema
          {data && <span className="ml-1 text-muted-foreground/60">— {data.total} eventos</span>}
        </p>
      </div>

      <FiltersBar filters={filters} onChange={setFilters} />

      <div className="mt-4 flex gap-6">
        {/* Table */}
        <div className={`flex-1 min-w-0 ${panelOpen ? 'hidden lg:block' : ''}`}>
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            {isLoading ? (
              <div className="py-16 text-center text-sm text-muted-foreground/60">Cargando registros…</div>
            ) : logs.length === 0 ? (
              <div className="py-16 text-center text-sm text-muted-foreground/60">No hay registros con los filtros aplicados</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/30 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3 text-left w-36">Fecha</th>
                    <th className="px-4 py-3 text-left w-28">Módulo</th>
                    <th className="px-4 py-3 text-left">Acción</th>
                    <th className="px-4 py-3 text-left">Usuario</th>
                    <th className="px-4 py-3 text-left w-28">Recurso</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {logs.map((log) => (
                    <tr
                      key={log.id}
                      onClick={() => handleSelect(log)}
                      className={`cursor-pointer transition-colors hover:bg-muted/20 ${
                        selected?.id === log.id ? 'bg-muted/20' : ''
                      }`}
                    >
                      <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(log.createdAt)}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="inline-flex rounded-full bg-muted/30 px-2 py-0.5 text-xs font-medium text-muted-foreground">
                          {MODULE_LABELS[log.module] ?? log.module}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                        {log.action}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {log.user
                          ? `${log.user.firstName} ${log.user.lastName}`
                          : <span className="text-muted-foreground/60 italic">sistema</span>}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground/60 truncate max-w-[100px]">
                        {log.resourceId ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
              <span>Página {page} de {totalPages}</span>
              <div className="flex gap-1">
                <button
                  onClick={() => setFilters((f) => ({ ...f, page: page - 1 }))}
                  disabled={page <= 1}
                  className="rounded-lg border border-border p-1.5 hover:bg-muted/20 disabled:opacity-40"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={() => setFilters((f) => ({ ...f, page: page + 1 }))}
                  disabled={page >= totalPages}
                  className="rounded-lg border border-border p-1.5 hover:bg-muted/20 disabled:opacity-40"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Detail panel */}
        {panelOpen && (
          <div className="w-96 shrink-0 rounded-xl border border-border bg-card overflow-hidden self-start sticky top-4">
            <DetailPanel log={selected} onClose={() => setSelected(null)} />
          </div>
        )}
      </div>
    </div>
  );
}
