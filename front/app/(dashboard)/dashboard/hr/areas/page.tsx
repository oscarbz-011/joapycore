'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Users2, LayoutGrid, Receipt, Pencil, Check, X } from 'lucide-react';
import { hrApi, type Area, type Position } from '../../../../../lib/api/hr';
import { usersApi } from '../../../../../lib/api/users';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { cn } from '@/lib/utils';

function HrNav({ active }: { active: 'employees' | 'areas' | 'payroll' }) {
  const links = [
    { key: 'employees', label: 'Empleados',     href: '/dashboard/hr',         icon: Users2 },
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

function ActiveBadge({ isActive }: { isActive: boolean }) {
  return isActive
    ? <Badge variant="outline" className="bg-accent-subtle text-accent-on border-accent-on/20">Activa</Badge>
    : <Badge variant="outline" className="bg-muted/30 text-muted-foreground border-border">Inactiva</Badge>;
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
    <div className="rounded-xl border border-border bg-card p-5">
      <h2 className="mb-4 text-sm font-semibold text-foreground">Áreas / Departamentos</h2>

      <form
        onSubmit={(e) => { e.preventDefault(); if (name.trim()) createMutation.mutate(); }}
        className="mb-4 flex gap-2"
      >
        <Input
          className="flex-1"
          placeholder="Nombre del área..."
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <Button type="submit" disabled={createMutation.isPending} size="sm">
          <Plus size={14} />
          Agregar
        </Button>
      </form>
      {error && <p className="mb-3 text-xs text-destructive">{error}</p>}

      {areas.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground/60">No hay áreas registradas.</p>
      ) : (
        <ul className="space-y-1.5">
          {areas.map((area: Area) => (
            <li key={area.id} className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2">
              <span className="text-sm text-foreground">{area.name}</span>
              <div className="flex items-center gap-2">
                <ActiveBadge isActive={area.isActive} />
                <button
                  type="button"
                  onClick={() => toggleMutation.mutate(area)}
                  disabled={toggleMutation.isPending}
                  className="text-xs text-muted-foreground/60 hover:text-foreground disabled:opacity-50"
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
    <li className={cn('rounded-lg border px-3 py-2.5 transition-colors', pos.isActive ? 'border-border' : 'border-border opacity-60')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{pos.name}</p>
          {!editing ? (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {pos.area && (
                <span className="inline-flex items-center rounded-md bg-muted/30 px-2 py-0.5 text-xs text-muted-foreground">
                  {pos.area.name}
                </span>
              )}
              {pos.role && (
                <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                  Rol: {pos.role.name}
                </span>
              )}
              {!pos.area && !pos.role && (
                <span className="text-xs text-muted-foreground/60">Sin área ni rol</span>
              )}
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="ml-1 text-xs text-muted-foreground/60 hover:text-foreground flex items-center gap-0.5"
              >
                <Pencil size={10} /> editar
              </button>
            </div>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Select value={areaId || 'none'} onValueChange={(v) => setAreaId(v && v !== 'none' ? v : '')}>
                <SelectTrigger className="h-8 flex-1 rounded-2xl">
                  <span className="flex-1 text-left text-sm truncate">{areas.find((a) => a.id === areaId)?.name ?? '— Sin área —'}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Sin área —</SelectItem>
                  {areas.filter((a) => a.isActive).map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={roleId || 'none'} onValueChange={(v) => setRoleId(v && v !== 'none' ? v : '')}>
                <SelectTrigger className="h-8 flex-1 rounded-2xl">
                  <span className="flex-1 text-left text-sm truncate">{(roles as Array<{ id: string; name: string }>).find((r) => r.id === roleId)?.name ?? '— Sin rol —'}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Sin rol —</SelectItem>
                  {roles.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button type="button" onClick={commit} className="text-emerald-600 hover:text-emerald-700"><Check size={14} /></button>
              <button type="button" onClick={cancel} className="text-muted-foreground/60 hover:text-muted-foreground"><X size={14} /></button>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2 pt-0.5">
          <ActiveBadge isActive={pos.isActive} />
          <button
            type="button"
            onClick={onToggle}
            className="text-xs text-muted-foreground/60 hover:text-foreground"
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
    <div className="rounded-xl border border-border bg-card p-5">
      <h2 className="mb-4 text-sm font-semibold text-foreground">Cargos / Puestos</h2>

      {/* Create form */}
      <div className="mb-4 space-y-2 rounded-lg border border-border bg-muted/30 p-3">
        <Input
          placeholder="Nombre del cargo..."
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="flex gap-2">
          <Select value={areaId || 'none'} onValueChange={(v) => setAreaId(v && v !== 'none' ? v : '')}>
            <SelectTrigger className="h-8 flex-1 rounded-2xl">
              <span className="flex-1 text-left text-sm truncate">{activeAreas.find((a) => a.id === areaId)?.name ?? '— Área (opcional) —'}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— Área (opcional) —</SelectItem>
              {activeAreas.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={roleId || 'none'} onValueChange={(v) => setRoleId(v && v !== 'none' ? v : '')}>
            <SelectTrigger className="h-8 flex-1 rounded-2xl">
              <span className="flex-1 text-left text-sm truncate">{(roles as Array<{ id: string; name: string }>).find((r) => r.id === roleId)?.name ?? '— Rol del sistema —'}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— Rol del sistema —</SelectItem>
              {(roles as Array<{ id: string; name: string }>).map((r) => (
                <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          className="w-full"
          size="sm"
          disabled={!name.trim() || createMutation.isPending}
          onClick={() => createMutation.mutate()}
        >
          <Plus size={14} />
          Agregar cargo
        </Button>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>

      {positions.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground/60">No hay cargos registrados.</p>
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
        <h1 className="text-2xl font-semibold text-foreground">RRHH</h1>
        <p className="mt-1 text-sm text-muted-foreground">Gestión de empleados, áreas y nómina</p>
      </div>

      <HrNav active="areas" />

      <div className="grid grid-cols-2 gap-6">
        <AreasPanel />
        <PositionsPanel />
      </div>
    </div>
  );
}
