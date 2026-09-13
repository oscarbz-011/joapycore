'use client';

import { apiErrorMessage } from '@/lib/api/api-error';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Monitor, Plus, X } from 'lucide-react';
import {
  posApi,
  type CreatePosTerminalPayload,
  type PosTerminal,
} from '../../../../../lib/api/pos';
import { branchesApi, type Branch } from '../../../../../lib/api/branches';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';

// ── Form (side panel) ────────────────────────────────────────────────────────

function TerminalForm({
  initial,
  branches,
  onClose,
}: {
  initial?: PosTerminal;
  branches: Branch[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CreatePosTerminalPayload>(
    initial
      ? { name: initial.name, branchId: initial.branchId }
      : { name: '', branchId: branches[0]?.id ?? '' },
  );
  const [error, setError] = useState('');

  function set<K extends keyof CreatePosTerminalPayload>(k: K, v: CreatePosTerminalPayload[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = { name: form.name.trim(), branchId: form.branchId };
      return initial
        ? posApi.updateTerminal(initial.id, payload)
        : posApi.createTerminal(payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pos-terminals'] });
      onClose();
    },
    onError: (err: Error) => {
      setError(apiErrorMessage(err, 'Error al guardar'));
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: () => posApi.updateTerminal(initial!.id, { isActive: !initial!.isActive }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pos-terminals'] });
      onClose();
    },
  });

  const inp =
    'w-full rounded-lg border border-border bg-card text-foreground px-3 py-2 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring/30';
  const lbl = 'block text-xs font-medium text-muted-foreground mb-1';

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold text-foreground">{initial ? initial.name : 'Nueva caja'}</h2>
        <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground/60 hover:bg-muted/20">
          <X size={16} />
        </button>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError('');
          saveMutation.mutate();
        }}
        className="flex-1 space-y-4 overflow-y-auto px-5 py-4"
      >
        <div>
          <label className={lbl}>Nombre *</label>
          <input
            className={inp}
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            required
            placeholder="Caja 1"
          />
        </div>

        <div>
          <label className={lbl}>Sucursal *</label>
          <Select value={form.branchId} onValueChange={(v) => set('branchId', v ?? '')}>
            <SelectTrigger className="w-full">
              <span className="flex-1 truncate text-left text-sm">
                {branches.find((b) => b.id === form.branchId)?.name ?? 'Seleccionar sucursal'}
              </span>
            </SelectTrigger>
            <SelectContent>
              {branches.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="space-y-2 border-t border-border pt-2">
          <button
            type="submit"
            disabled={saveMutation.isPending || !form.branchId}
            className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saveMutation.isPending ? 'Guardando...' : initial ? 'Guardar cambios' : 'Crear caja'}
          </button>
          {initial && (
            <button
              type="button"
              onClick={() => toggleActiveMutation.mutate()}
              disabled={toggleActiveMutation.isPending}
              className={`w-full rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50 ${
                initial.isActive
                  ? 'border-border text-muted-foreground hover:bg-muted/20'
                  : 'border-primary/30 text-primary hover:bg-primary/5'
              }`}
            >
              {initial.isActive ? 'Desactivar caja' : 'Activar caja'}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────

function TerminalCard({
  terminal,
  selected,
  onClick,
}: {
  terminal: PosTerminal;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`flex flex-col rounded-[14px] border bg-card p-5 cursor-pointer transition-colors hover:border-primary/40 ${
        selected ? 'border-primary/50 bg-primary/5' : 'border-border'
      }`}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] ${
            terminal.isActive ? 'bg-primary/10' : 'bg-muted/30'
          }`}
        >
          <Monitor size={18} className={terminal.isActive ? 'text-primary' : 'text-muted-foreground/60'} />
        </div>
        {!terminal.isActive && (
          <span className="rounded-full bg-muted/30 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            Inactiva
          </span>
        )}
      </div>
      <p className="mb-1 text-[13.5px] font-semibold text-foreground">{terminal.name}</p>
      <p className="truncate text-[12px] text-muted-foreground">{terminal.branch.name}</p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PosTerminalsSettingsPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTerminal, setSelectedTerminal] = useState<PosTerminal | null>(null);

  const { data: terminals = [], isLoading } = useQuery({
    queryKey: ['pos-terminals'],
    queryFn: posApi.listTerminals,
  });
  const { data: branches = [] } = useQuery({ queryKey: ['branches'], queryFn: branchesApi.listBranches });

  const panelOpen = showCreate || selectedTerminal !== null;

  function openTerminal(t: PosTerminal) {
    setShowCreate(false);
    setSelectedTerminal(t);
  }
  function openCreate() {
    setSelectedTerminal(null);
    setShowCreate(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Cajas registradoras</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gestioná las cajas del punto de venta por sucursal
          </p>
        </div>
        <Button onClick={openCreate} disabled={branches.length === 0}>
          <Plus size={15} /> Nueva caja
        </Button>
      </div>

      <div className="flex gap-5">
        <div className={`min-w-0 flex-1 ${panelOpen ? 'hidden sm:block' : ''}`}>
          {isLoading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-36 animate-pulse rounded-[14px] bg-muted/30" />
              ))}
            </div>
          ) : terminals.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Monitor size={32} className="mb-3 text-muted-foreground/60" />
              <p className="text-sm text-muted-foreground/60">
                {branches.length === 0
                  ? 'Creá primero una sucursal en Ajustes → Sucursales.'
                  : 'No hay cajas registradas.'}
              </p>
              {branches.length > 0 && (
                <button type="button" onClick={openCreate} className="mt-3 text-sm font-medium text-primary hover:underline">
                  Crear la primera
                </button>
              )}
            </div>
          ) : (
            <div className={`grid gap-3 ${panelOpen ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'}`}>
              {terminals.map((t) => (
                <TerminalCard key={t.id} terminal={t} selected={selectedTerminal?.id === t.id} onClick={() => openTerminal(t)} />
              ))}
            </div>
          )}
        </div>

        {panelOpen && (
          <div className="w-80 shrink-0 overflow-hidden rounded-[14px] border border-border bg-card">
            {showCreate ? (
              <TerminalForm branches={branches} onClose={() => setShowCreate(false)} />
            ) : selectedTerminal ? (
              <TerminalForm
                key={selectedTerminal.id}
                initial={selectedTerminal}
                branches={branches}
                onClose={() => setSelectedTerminal(null)}
              />
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
