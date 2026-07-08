'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Users2, LayoutGrid, Receipt, Pencil, Check, X } from 'lucide-react';
import { hrApi, type Area, type Position } from '../../../../../lib/api/hr';
import { usersApi } from '../../../../../lib/api/users';

function HrNav({ active }: { active: 'employees' | 'areas' | 'payroll' }) {
  const links = [
    { key: 'employees', label: 'Empleados', href: '/dashboard/hr', icon: Users2 },
    { key: 'areas', label: 'Áreas y cargos', href: '/dashboard/hr/areas', icon: LayoutGrid },
    { key: 'payroll', label: 'Nómina', href: '/dashboard/hr/payroll', icon: Receipt },
  ] as const;

  return (
    <div className="flex gap-1 border-b border-border mb-6">
      {links.map(({ key, label, href, icon: Icon }) => (
        <Link
          key={key}
          href={href}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
            active === key
              ? 'border-ink text-ink'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          <Icon size={15} />
          {label}
        </Link>
      ))}
    </div>
  );
}

function ActiveBadge({ isActive }: { isActive: boolean }) {
  return isActive ? (
    <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Activa</span>
  ) : (
    <span className="inline-flex rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-muted">Inactiva</span>
  );
}

// ── Areas panel ───────────────────────────────────────────────────────────────

function AreasPanel() {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const { data: areas = [] } = useQuery({ queryKey: ['hr-areas'], queryFn: hrApi.listAreas });

  const createMutation = useMutation({
    mutationFn: () => hrApi.createArea({ name }),
    onSuccess: () => {
      setName('');
      setError('');
      void queryClient.invalidateQueries({ queryKey: ['hr-areas'] });
    },
    onError: (err: Error & { message?: string }) => {
      setError(err?.message ?? 'Error al crear área');
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (area: Area) => hrApi.updateArea(area.id, { isActive: !area.isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['hr-areas'] }),
  });

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h2 className="mb-4 text-sm font-semibold text-ink">Áreas / Departamentos</h2>

      <form
        onSubmit={(e) => { e.preventDefault(); if (name.trim()) createMutation.mutate(); }}
        className="mb-4 flex gap-2"
      >
        <input
          className="flex-1 rounded-lg border border-border-strong bg-surface text-ink px-3 py-2 text-sm focus:border-border-strong focus:outline-none focus:ring-1 focus:ring-border-strong"
          placeholder="Nombre del área..."
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="flex items-center gap-1.5 rounded-lg bg-ink px-3 py-2 text-sm font-medium text-canvas hover:opacity-80 disabled:opacity-50"
        >
          <Plus size={14} />
          Agregar
        </button>
      </form>
      {error && <p className="mb-3 text-xs text-red-600">{error}</p>}

      {areas.length === 0 ? (
        <p className="py-4 text-center text-sm text-faint">No hay áreas registradas.</p>
      ) : (
        <ul className="space-y-1.5">
          {areas.map((area: Area) => (
            <li key={area.id} className="flex items-center justify-between rounded-lg border border-border bg-surface text-ink px-3 py-2">
              <span className="text-sm text-ink">{area.name}</span>
              <div className="flex items-center gap-2">
                <ActiveBadge isActive={area.isActive} />
                <button
                  onClick={() => toggleMutation.mutate(area)}
                  disabled={toggleMutation.isPending}
                  className="text-xs text-faint hover:text-ink disabled:opacity-50"
                >
                  {area.isActive ? 'Desactivar' : 'Activar'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Position row with inline edit ─────────────────────────────────────────────

function PositionRow({
  pos,
  areas,
  roles,
  onToggle,
  onUpdate,
}: {
  pos: Position;
  areas: Area[];
  roles: Array<{ id: string; name: string }>;
  onToggle: () => void;
  onUpdate: (data: { areaId: string | null; roleId: string | null }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [areaId, setAreaId] = useState(pos.area?.id ?? '');
  const [roleId, setRoleId] = useState(pos.role?.id ?? '');

  function commit() {
    onUpdate({ areaId: areaId || null, roleId: roleId || null });
    setEditing(false);
  }

  function cancel() {
    setAreaId(pos.area?.id ?? '');
    setRoleId(pos.role?.id ?? '');
    setEditing(false);
  }

  return (
    <li className={`rounded-lg border px-3 py-2.5 transition-colors ${pos.isActive ? 'border-border' : 'border-border opacity-60'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">{pos.name}</p>
          {!editing ? (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {pos.area && (
                <span className="inline-flex items-center rounded-md bg-surface-2 px-2 py-0.5 text-xs text-muted">
                  {pos.area.name}
                </span>
              )}
              {pos.role && (
                <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                  Rol: {pos.role.name}
                </span>
              )}
              {!pos.area && !pos.role && (
                <span className="text-xs text-faint">Sin área ni rol</span>
              )}
              <button
                onClick={() => setEditing(true)}
                className="ml-1 text-xs text-faint hover:text-ink flex items-center gap-0.5"
              >
                <Pencil size={10} /> editar
              </button>
            </div>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <select
                value={areaId}
                onChange={(e) => setAreaId(e.target.value)}
                className="rounded-md border border-border-strong bg-surface text-ink px-2 py-1 text-xs focus:border-border-strong focus:outline-none"
              >
                <option value="">— Sin área —</option>
                {areas.filter((a) => a.isActive).map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
              <select
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
                className="rounded-md border border-border-strong bg-surface text-ink px-2 py-1 text-xs focus:border-border-strong focus:outline-none"
              >
                <option value="">— Sin rol —</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
              <button onClick={commit} className="text-emerald-600 hover:text-emerald-700"><Check size={14} /></button>
              <button onClick={cancel} className="text-faint hover:text-muted"><X size={14} /></button>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2 pt-0.5">
          <ActiveBadge isActive={pos.isActive} />
          <button
            onClick={onToggle}
            className="text-xs text-faint hover:text-ink"
          >
            {pos.isActive ? 'Desactivar' : 'Activar'}
          </button>
        </div>
      </div>
    </li>
  );
}

// ── Positions panel ───────────────────────────────────────────────────────────

function PositionsPanel() {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [areaId, setAreaId] = useState('');
  const [roleId, setRoleId] = useState('');
  const [error, setError] = useState('');

  const { data: positions = [] } = useQuery({ queryKey: ['hr-positions'], queryFn: hrApi.listPositions });
  const { data: areas = [] } = useQuery({ queryKey: ['hr-areas'], queryFn: hrApi.listAreas });
  const { data: roles = [] } = useQuery({ queryKey: ['roles'], queryFn: usersApi.listRoles });

  const createMutation = useMutation({
    mutationFn: () => hrApi.createPosition({
      name,
      areaId: areaId || undefined,
      roleId: roleId || undefined,
    }),
    onSuccess: () => {
      setName('');
      setAreaId('');
      setRoleId('');
      setError('');
      void queryClient.invalidateQueries({ queryKey: ['hr-positions'] });
    },
    onError: (err: Error & { message?: string }) => {
      setError(err?.message ?? 'Error al crear cargo');
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (pos: Position) => hrApi.updatePosition(pos.id, { isActive: !pos.isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['hr-positions'] }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { areaId: string | null; roleId: string | null } }) =>
      hrApi.updatePosition(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['hr-positions'] }),
  });

  const activeAreas = (areas as Area[]).filter((a) => a.isActive);

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h2 className="mb-4 text-sm font-semibold text-ink">Cargos / Puestos</h2>

      {/* Create form */}
      <div className="mb-4 space-y-2 rounded-lg border border-border bg-surface-2 p-3">
        <input
          className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm focus:border-border-strong focus:outline-none"
          placeholder="Nombre del cargo..."
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="flex gap-2">
          <select
            value={areaId}
            onChange={(e) => setAreaId(e.target.value)}
            className="flex-1 rounded-lg border border-border-strong bg-surface px-2 py-2 text-sm focus:border-border-strong focus:outline-none"
          >
            <option value="">— Área (opcional) —</option>
            {activeAreas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select
            value={roleId}
            onChange={(e) => setRoleId(e.target.value)}
            className="flex-1 rounded-lg border border-border-strong bg-surface px-2 py-2 text-sm focus:border-border-strong focus:outline-none"
          >
            <option value="">— Rol del sistema —</option>
            {(roles as Array<{ id: string; name: string }>).map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
        <button
          type="button"
          disabled={!name.trim() || createMutation.isPending}
          onClick={() => createMutation.mutate()}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-ink px-3 py-2 text-sm font-medium text-canvas hover:opacity-80 disabled:opacity-50"
        >
          <Plus size={14} />
          Agregar cargo
        </button>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>

      {positions.length === 0 ? (
        <p className="py-4 text-center text-sm text-faint">No hay cargos registrados.</p>
      ) : (
        <ul className="space-y-1.5">
          {(positions as Position[]).map((pos) => (
            <PositionRow
              key={pos.id}
              pos={pos}
              areas={areas as Area[]}
              roles={roles as Array<{ id: string; name: string }>}
              onToggle={() => toggleMutation.mutate(pos)}
              onUpdate={(data) => updateMutation.mutate({ id: pos.id, data })}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HrAreasPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-ink">RRHH</h1>
        <p className="mt-1 text-sm text-muted">Gestión de empleados, áreas y nómina</p>
      </div>

      <HrNav active="areas" />

      <div className="grid grid-cols-2 gap-6">
        <AreasPanel />
        <PositionsPanel />
      </div>
    </div>
  );
}
