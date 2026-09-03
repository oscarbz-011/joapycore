'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, X } from 'lucide-react';
import { procurementApi, type CreateSupplierPayload, type Supplier } from '../../../../../lib/api/procurement';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

// ── Sub-nav ────────────────────────────────────────────────────────────────────

// ── Supplier form ──────────────────────────────────────────────────────────────

const EMPTY_FORM: CreateSupplierPayload = {
  name: '',
  contactName: '',
  email: '',
  phone: '',
  address: '',
  taxId: '',
  isImporter: false,
  paymentTermDays: 0,
};

function fromSupplier(s: Supplier): CreateSupplierPayload {
  return {
    name: s.name,
    contactName: s.contactName ?? '',
    email: s.email ?? '',
    phone: s.phone ?? '',
    address: s.address ?? '',
    taxId: s.taxId ?? '',
    isImporter: s.isImporter,
    paymentTermDays: s.paymentTermDays ?? 0,
  };
}

function SupplierForm({
  initial,
  onClose,
}: {
  initial?: Supplier;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CreateSupplierPayload>(
    initial ? fromSupplier(initial) : EMPTY_FORM,
  );
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  function set<K extends keyof CreateSupplierPayload>(k: K, v: CreateSupplierPayload[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload: CreateSupplierPayload = {
        name: form.name.trim(),
        contactName: (form.contactName as string)?.trim() || undefined,
        email: (form.email as string)?.trim() || undefined,
        phone: (form.phone as string)?.trim() || undefined,
        address: (form.address as string)?.trim() || undefined,
        taxId: (form.taxId as string)?.trim() || undefined,
        isImporter: form.isImporter,
        paymentTermDays: form.paymentTermDays ?? 0,
      };
      return initial
        ? procurementApi.updateSupplier(initial.id, payload)
        : procurementApi.createSupplier(payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      onClose();
    },
    onError: (err: Error & { response?: { data?: { message?: string | string[] } } }) => {
      const msg = err?.response?.data?.message;
      setError(Array.isArray(msg) ? msg[0] : (msg ?? 'Error al guardar'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => procurementApi.deleteSupplier(initial!.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      onClose();
    },
  });

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold text-foreground">
          {initial ? initial.name : 'Nuevo proveedor'}
        </h2>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
          <X size={18} />
        </Button>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError('');
          saveMutation.mutate();
        }}
        className="flex-1 overflow-y-auto px-5 py-4 space-y-3"
      >
        <div className="space-y-1.5">
          <Label>Nombre / Razón social *</Label>
          <Input
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            required
            placeholder="Importadora ABC S.A."
          />
        </div>

        <div className="space-y-1.5">
          <Label>Contacto</Label>
          <Input
            value={form.contactName as string}
            onChange={(e) => set('contactName', e.target.value)}
            placeholder="Juan Pérez"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input
              type="email"
              value={form.email as string}
              onChange={(e) => set('email', e.target.value)}
              placeholder="ventas@proveedor.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Teléfono</Label>
            <Input
              value={form.phone as string}
              onChange={(e) => set('phone', e.target.value)}
              placeholder="021 000 000"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>RUC</Label>
            <Input
              value={form.taxId as string}
              onChange={(e) => set('taxId', e.target.value)}
              placeholder="80012345-6"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Dirección</Label>
            <Input
              value={form.address as string}
              onChange={(e) => set('address', e.target.value)}
              placeholder="Asunción"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Plazo de pago (días)</Label>
          <Input
            type="number"
            min={0}
            value={form.paymentTermDays ?? 0}
            onChange={(e) => set('paymentTermDays', Number(e.target.value) || 0)}
            placeholder="0"
          />
          <p className="text-xs text-muted-foreground/60">
            0 = contado. Determina el vencimiento de las cuentas por pagar generadas al recibir mercadería de este proveedor.
          </p>
        </div>

        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={form.isImporter as boolean}
            onChange={(e) => set('isImporter', e.target.checked)}
            className="h-4 w-4 rounded border-border accent-primary"
          />
          <span className="text-sm font-medium text-muted-foreground">Es importador</span>
        </label>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex gap-2 pt-2 border-t border-border">
          <Button type="submit" className="flex-1" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? 'Guardando...' : initial ? 'Guardar cambios' : 'Crear proveedor'}
          </Button>
        </div>

        {initial && (
          <div>
            {!confirmDelete ? (
              <Button
                type="button"
                variant="outline"
                className="w-full border-destructive/30 text-destructive hover:bg-destructive/10"
                onClick={() => setConfirmDelete(true)}
              >
                Eliminar proveedor
              </Button>
            ) : (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
                <p className="text-xs text-destructive mb-2">¿Confirmar eliminación?</p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="flex-1"
                    onClick={() => deleteMutation.mutate()}
                    disabled={deleteMutation.isPending}
                  >
                    {deleteMutation.isPending ? 'Eliminando...' : 'Sí, eliminar'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => setConfirmDelete(false)}
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </form>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function SuppliersPage() {
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);

  const { data: suppliers = [], isLoading } = useQuery({
    queryKey: ['suppliers'],
    queryFn: procurementApi.listSuppliers,
  });

  const filtered = suppliers.filter((s) => {
    const text = `${s.name} ${s.email ?? ''} ${s.taxId ?? ''} ${s.contactName ?? ''}`.toLowerCase();
    return !search || text.includes(search.toLowerCase());
  });

  const panelOpen = showCreate || selectedSupplier !== null;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Proveedores</h1>
          <p className="mt-1 text-sm text-muted-foreground">Proveedores registrados y sus condiciones de pago</p>
        </div>
        <Button onClick={() => { setSelectedSupplier(null); setShowCreate(true); }}>
          <Plus size={16} />
          Nuevo proveedor
        </Button>
      </div>

      <div className="flex gap-6">
        {/* List */}
        <div className={cn('flex-1 min-w-0', panelOpen ? 'hidden sm:block' : '')}>
          <div className="relative mb-4">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
            <Input
              className="pl-8"
              placeholder="Buscar por nombre, email o RUC..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {isLoading ? (
            <div className="py-16 text-center text-sm text-muted-foreground/60">Cargando proveedores...</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-sm text-muted-foreground/60">No se encontraron proveedores.</p>
              <button
                onClick={() => setShowCreate(true)}
                className="mt-3 text-sm font-medium text-foreground underline underline-offset-2"
              >
                Crear el primero
              </button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <ul className="divide-y divide-border">
                {filtered.map((supplier) => (
                  <li
                    key={supplier.id}
                    onClick={() => { setShowCreate(false); setSelectedSupplier(supplier); }}
                    className={cn(
                      'flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/20 transition-colors',
                      selectedSupplier?.id === supplier.id ? 'bg-muted/20' : '',
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-foreground truncate">{supplier.name}</p>
                        {supplier.isImporter && (
                          <span className="inline-flex shrink-0 rounded-full bg-violet-50 px-1.5 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                            Importador
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground/60 truncate">
                        {[
                          supplier.contactName,
                          supplier.email,
                          supplier.taxId ? `RUC: ${supplier.taxId}` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                    {!supplier.isActive && (
                      <Badge variant="outline" className="ml-3 shrink-0 bg-muted/30 text-muted-foreground border-border">
                        Inactivo
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Side panel */}
        {panelOpen && (
          <div className="w-80 shrink-0 rounded-xl border border-border bg-card overflow-hidden">
            {showCreate ? (
              <SupplierForm onClose={() => setShowCreate(false)} />
            ) : selectedSupplier ? (
              <SupplierForm
                key={selectedSupplier.id}
                initial={selectedSupplier}
                onClose={() => setSelectedSupplier(null)}
              />
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
