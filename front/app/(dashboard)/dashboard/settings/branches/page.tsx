'use client';

import { apiErrorMessage } from '@/lib/api/api-error';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, X, Star, Building2, MapPin, Phone, LayoutGrid, List } from 'lucide-react';
import { branchesApi, type Branch, type CreateBranchPayload } from '../../../../../lib/api/branches';
import { Button } from '@/components/ui/button';

// ── Form state ────────────────────────────────────────────────────────────────

type FormState = {
  name: string; address: string; numeroCasa: string; city: string; phone: string; email: string;
  isMain: boolean; codigoEstablecimiento: string; puntoExpedicion: string;
  departamentoCodigo: string; departamentoDesc: string;
  distritoCodigo: string; distritoDesc: string;
  ciudadCodigo: string; ciudadDesc: string;
};

function fromBranch(b: Branch): FormState {
  return {
    name: b.name, address: b.address ?? '', numeroCasa: b.numeroCasa ?? '', city: b.city ?? '',
    phone: b.phone ?? '', email: b.email ?? '', isMain: b.isMain,
    codigoEstablecimiento: b.codigoEstablecimiento ?? '',
    puntoExpedicion: b.puntoExpedicion ?? '',
    departamentoCodigo: b.departamentoCodigo?.toString() ?? '', departamentoDesc: b.departamentoDesc ?? '',
    distritoCodigo: b.distritoCodigo?.toString() ?? '', distritoDesc: b.distritoDesc ?? '',
    ciudadCodigo: b.ciudadCodigo?.toString() ?? '', ciudadDesc: b.ciudadDesc ?? '',
  };
}

function blankForm(): FormState {
  return {
    name: '', address: '', numeroCasa: '', city: '', phone: '', email: '', isMain: false,
    codigoEstablecimiento: '', puntoExpedicion: '', departamentoCodigo: '', departamentoDesc: '',
    distritoCodigo: '', distritoDesc: '', ciudadCodigo: '', ciudadDesc: '',
  };
}

// ── Branch form (side panel) ──────────────────────────────────────────────────

function BranchForm({ initial, onClose }: { initial?: Branch; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(initial ? fromBranch(initial) : blankForm());
  const [error, setError] = useState('');

  const set = (field: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload: CreateBranchPayload = {
        name: form.name.trim(),
        address: form.address.trim() || undefined,
        numeroCasa: form.numeroCasa.trim() || undefined,
        city: form.city.trim() || undefined,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        isMain: form.isMain,
        codigoEstablecimiento: form.codigoEstablecimiento.trim() || undefined,
        puntoExpedicion: form.puntoExpedicion.trim() || undefined,
        departamentoCodigo: form.departamentoCodigo ? Number(form.departamentoCodigo) : undefined,
        departamentoDesc: form.departamentoDesc.trim() || undefined,
        distritoCodigo: form.distritoCodigo ? Number(form.distritoCodigo) : undefined,
        distritoDesc: form.distritoDesc.trim() || undefined,
        ciudadCodigo: form.ciudadCodigo ? Number(form.ciudadCodigo) : undefined,
        ciudadDesc: form.ciudadDesc.trim() || undefined,
      };
      return initial ? branchesApi.updateBranch(initial.id, payload) : branchesApi.createBranch(payload);
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['branches'] }); onClose(); },
    onError: (err: Error) => {
      setError(apiErrorMessage(err, 'Error al guardar'));
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: () => branchesApi.updateBranch(initial!.id, { isActive: !initial!.isActive }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['branches'] }); onClose(); },
  });

  const inp = 'w-full rounded-lg border border-border bg-card text-foreground px-3 py-2 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring/30';
  const lbl = 'block text-xs font-medium text-muted-foreground mb-1';

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold text-foreground">{initial ? initial.name : 'Nueva sucursal'}</h2>
        <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground/60 hover:bg-muted/20"><X size={16} /></button>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); setError(''); saveMutation.mutate(); }}
        className="flex-1 overflow-y-auto px-5 py-4 space-y-4"
      >
        <div>
          <label className={lbl}>Nombre *</label>
          <input className={inp} value={form.name} onChange={set('name')} required placeholder="Sucursal Central" />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2">
            <label className={lbl}>Dirección</label>
            <input className={inp} value={form.address} onChange={set('address')} placeholder="Av. Mariscal López" />
          </div>
          <div>
            <label className={lbl}>Número</label>
            <input className={inp} value={form.numeroCasa} onChange={set('numeroCasa')} placeholder="1234" />
          </div>
        </div>

        <div>
          <label className={lbl}>Ciudad</label>
          <input className={inp} value={form.city} onChange={set('city')} placeholder="Asunción" />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={lbl}>Teléfono</label>
            <input className={inp} value={form.phone} onChange={set('phone')} placeholder="021 000 000" />
          </div>
          <div>
            <label className={lbl}>Email</label>
            <input type="email" className={inp} value={form.email} onChange={set('email')} placeholder="sucursal@empresa.com" />
          </div>
        </div>

        <label className="flex items-center gap-2.5 cursor-pointer">
          <input type="checkbox" checked={form.isMain} onChange={set('isMain')} className="h-4 w-4 rounded border-border accent-primary" />
          <span className="text-sm font-medium text-muted-foreground">Sucursal principal</span>
        </label>

        <div className="pt-2 border-t border-border">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">SIFEN — Establecimiento</p>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={lbl}>Código de establecimiento (SET)</label>
                <input className={inp} value={form.codigoEstablecimiento} onChange={set('codigoEstablecimiento')} placeholder="001" maxLength={3} />
              </div>
              <div>
                <label className={lbl}>Punto de expedición</label>
                <input className={inp} value={form.puntoExpedicion} onChange={set('puntoExpedicion')} placeholder="001" maxLength={3} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className={lbl}>Cód. Dpto.</label>
                <input type="number" className={inp} value={form.departamentoCodigo} onChange={set('departamentoCodigo')} placeholder="11" />
              </div>
              <div className="col-span-2">
                <label className={lbl}>Departamento</label>
                <input className={inp} value={form.departamentoDesc} onChange={set('departamentoDesc')} placeholder="CAPITAL" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className={lbl}>Cód. Distrito</label>
                <input type="number" className={inp} value={form.distritoCodigo} onChange={set('distritoCodigo')} placeholder="143" />
              </div>
              <div className="col-span-2">
                <label className={lbl}>Distrito</label>
                <input className={inp} value={form.distritoDesc} onChange={set('distritoDesc')} placeholder="ASUNCION" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className={lbl}>Cód. Ciudad</label>
                <input type="number" className={inp} value={form.ciudadCodigo} onChange={set('ciudadCodigo')} placeholder="1" />
              </div>
              <div className="col-span-2">
                <label className={lbl}>Ciudad</label>
                <input className={inp} value={form.ciudadDesc} onChange={set('ciudadDesc')} placeholder="ASUNCION (DISTRITO)" />
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
        )}

        <div className="pt-2 border-t border-border space-y-2">
          <button
            type="submit"
            disabled={saveMutation.isPending}
            className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saveMutation.isPending ? 'Guardando...' : initial ? 'Guardar cambios' : 'Crear sucursal'}
          </button>
          {initial && (
            <button
              type="button"
              onClick={() => toggleActiveMutation.mutate()}
              disabled={toggleActiveMutation.isPending}
              className={`w-full rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50 ${
                initial.isActive ? 'border-border text-muted-foreground hover:bg-muted/20' : 'border-primary/30 text-primary hover:bg-primary/5'
              }`}
            >
              {initial.isActive ? 'Desactivar sucursal' : 'Activar sucursal'}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

// ── Grid card ─────────────────────────────────────────────────────────────────

function BranchCard({ branch, selected, onClick }: { branch: Branch; selected: boolean; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`flex flex-col rounded-[14px] border bg-card p-5 cursor-pointer transition-colors hover:border-primary/40 ${
        selected ? 'border-primary/50 bg-primary/5' : 'border-border'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] ${
          branch.isActive ? 'bg-primary/10' : 'bg-muted/30'
        }`}>
          <Building2 size={18} className={branch.isActive ? 'text-primary' : 'text-muted-foreground/60'} />
        </div>
        <div className="flex flex-wrap gap-1 justify-end">
          {branch.isMain && (
            <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
              <Star size={9} className="fill-amber-500" /> Principal
            </span>
          )}
          {!branch.isActive && (
            <span className="rounded-full bg-muted/30 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Inactiva</span>
          )}
        </div>
      </div>

      <p className="text-[13.5px] font-semibold text-foreground mb-1">{branch.name}</p>

      <div className="space-y-0.5 mt-1">
        {(branch.address || branch.numeroCasa) && (
          <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <MapPin size={11} className="shrink-0 text-muted-foreground/60" />
            <span className="truncate">{[branch.address, branch.numeroCasa].filter(Boolean).join(' ')}</span>
          </p>
        )}
        {branch.phone && (
          <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <Phone size={11} className="shrink-0 text-muted-foreground/60" />
            <span>{branch.phone}</span>
          </p>
        )}
        {branch.codigoEstablecimiento && (
          <p className="text-[11.5px] text-muted-foreground/60 mt-1">Est. {branch.codigoEstablecimiento}</p>
        )}
      </div>
    </div>
  );
}

// ── List row ──────────────────────────────────────────────────────────────────

function BranchRow({ branch, selected, onClick }: { branch: Branch; selected: boolean; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-4 rounded-xl border bg-card px-5 py-4 cursor-pointer transition-colors hover:border-primary/40 ${
        selected ? 'border-primary/50 bg-primary/5' : 'border-border'
      }`}
    >
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] ${
        branch.isActive ? 'bg-primary/10' : 'bg-muted/30'
      }`}>
        <Building2 size={18} className={branch.isActive ? 'text-primary' : 'text-muted-foreground/60'} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[13.5px] font-semibold text-foreground">{branch.name}</p>
          {branch.isMain && (
            <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
              <Star size={9} className="fill-amber-500" /> Principal
            </span>
          )}
          {!branch.isActive && (
            <span className="rounded-full bg-muted/30 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Inactiva</span>
          )}
        </div>
        <p className="text-[12.5px] text-muted-foreground mt-0.5">
          {[branch.address, branch.numeroCasa].filter(Boolean).join(' ')}
          {branch.phone && ` · ${branch.phone}`}
          {branch.codigoEstablecimiento && ` · Est. ${branch.codigoEstablecimiento}`}
        </p>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function BranchesSettingsPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [view, setView] = useState<'grid' | 'list'>('grid');

  const { data: branches = [], isLoading } = useQuery({
    queryKey: ['branches'],
    queryFn: branchesApi.listBranches,
  });

  const panelOpen = showCreate || selectedBranch !== null;

  function openBranch(b: Branch) { setShowCreate(false); setSelectedBranch(b); }
  function openCreate() { setSelectedBranch(null); setShowCreate(true); }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Sucursales</h1>
          <p className="mt-1 text-sm text-muted-foreground">Gestioná las sucursales de tu empresa</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center gap-1 rounded-[10px] border border-border bg-card p-1">
            <button
              type="button"
              onClick={() => setView('grid')}
              className={`flex items-center gap-1.5 rounded-[7px] px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                view === 'grid' ? 'bg-muted/20 text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <LayoutGrid size={13} /><span>Grilla</span>
            </button>
            <button
              type="button"
              onClick={() => setView('list')}
              className={`flex items-center gap-1.5 rounded-[7px] px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                view === 'list' ? 'bg-muted/20 text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <List size={13} /><span>Lista</span>
            </button>
          </div>
          {/* New button */}
          <Button onClick={openCreate}>
            <Plus size={15} /> Nueva sucursal
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex gap-5">
        {/* Cards / rows */}
        <div className={`min-w-0 flex-1 ${panelOpen ? 'hidden sm:block' : ''}`}>
          {isLoading ? (
            <div className={view === 'grid'
              ? 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4'
              : 'space-y-2'
            }>
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className={`animate-pulse rounded-[14px] bg-muted/30 ${view === 'grid' ? 'h-40' : 'h-16'}`} />
              ))}
            </div>
          ) : branches.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Building2 size={32} className="text-muted-foreground/60 mb-3" />
              <p className="text-sm text-muted-foreground/60">No hay sucursales registradas.</p>
              <button type="button" onClick={openCreate} className="mt-3 text-sm font-medium text-primary hover:underline">
                Crear la primera
              </button>
            </div>
          ) : view === 'grid' ? (
            <div className={`grid gap-3 ${panelOpen ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'}`}>
              {branches.map((b) => (
                <BranchCard key={b.id} branch={b} selected={selectedBranch?.id === b.id} onClick={() => openBranch(b)} />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {branches.map((b) => (
                <BranchRow key={b.id} branch={b} selected={selectedBranch?.id === b.id} onClick={() => openBranch(b)} />
              ))}
            </div>
          )}
        </div>

        {/* Side panel */}
        {panelOpen && (
          <div className="w-80 shrink-0 overflow-hidden rounded-[14px] border border-border bg-card">
            {showCreate
              ? <BranchForm onClose={() => setShowCreate(false)} />
              : selectedBranch
                ? <BranchForm key={selectedBranch.id} initial={selectedBranch} onClose={() => setSelectedBranch(null)} />
                : null}
          </div>
        )}
      </div>
    </div>
  );
}
