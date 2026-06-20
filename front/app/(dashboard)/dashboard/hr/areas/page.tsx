'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Users2, LayoutGrid, Receipt } from 'lucide-react';
import { hrApi, type Area, type Position } from '../../../../../lib/api/hr';

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

function ActiveBadge({ isActive }: { isActive: boolean }) {
  return isActive ? (
    <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Activa</span>
  ) : (
    <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">Inactiva</span>
  );
}

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
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      setError(err?.response?.data?.message ?? 'Error al crear área');
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (area: Area) => hrApi.updateArea(area.id, { isActive: !area.isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['hr-areas'] }),
  });

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    createMutation.mutate();
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="mb-4 text-sm font-semibold text-slate-900">Áreas / Departamentos</h2>

      <form onSubmit={handleCreate} className="mb-4 flex gap-2">
        <input
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          placeholder="Nombre del área..."
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          <Plus size={14} />
          Agregar
        </button>
      </form>
      {error && <p className="mb-3 text-xs text-red-600">{error}</p>}

      {areas.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-400">No hay áreas registradas.</p>
      ) : (
        <ul className="space-y-1.5">
          {areas.map((area: Area) => (
            <li key={area.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
              <span className="text-sm text-slate-800">{area.name}</span>
              <div className="flex items-center gap-2">
                <ActiveBadge isActive={area.isActive} />
                <button
                  onClick={() => toggleMutation.mutate(area)}
                  disabled={toggleMutation.isPending}
                  className="text-xs text-slate-400 hover:text-slate-700 disabled:opacity-50"
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

function PositionsPanel() {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const { data: positions = [] } = useQuery({ queryKey: ['hr-positions'], queryFn: hrApi.listPositions });

  const createMutation = useMutation({
    mutationFn: () => hrApi.createPosition({ name }),
    onSuccess: () => {
      setName('');
      setError('');
      void queryClient.invalidateQueries({ queryKey: ['hr-positions'] });
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      setError(err?.response?.data?.message ?? 'Error al crear cargo');
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (pos: Position) => hrApi.updatePosition(pos.id, { isActive: !pos.isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['hr-positions'] }),
  });

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    createMutation.mutate();
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="mb-4 text-sm font-semibold text-slate-900">Cargos / Puestos</h2>

      <form onSubmit={handleCreate} className="mb-4 flex gap-2">
        <input
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          placeholder="Nombre del cargo..."
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          <Plus size={14} />
          Agregar
        </button>
      </form>
      {error && <p className="mb-3 text-xs text-red-600">{error}</p>}

      {positions.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-400">No hay cargos registrados.</p>
      ) : (
        <ul className="space-y-1.5">
          {positions.map((pos: Position) => (
            <li key={pos.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
              <span className="text-sm text-slate-800">{pos.name}</span>
              <div className="flex items-center gap-2">
                <ActiveBadge isActive={pos.isActive} />
                <button
                  onClick={() => toggleMutation.mutate(pos)}
                  disabled={toggleMutation.isPending}
                  className="text-xs text-slate-400 hover:text-slate-700 disabled:opacity-50"
                >
                  {pos.isActive ? 'Desactivar' : 'Activar'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function HrAreasPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">RRHH</h1>
        <p className="mt-1 text-sm text-slate-500">Gestión de empleados, áreas y nómina</p>
      </div>

      <HrNav active="areas" />

      <div className="grid grid-cols-2 gap-6">
        <AreasPanel />
        <PositionsPanel />
      </div>
    </div>
  );
}
