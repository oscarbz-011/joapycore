'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import { apiErrorMessage } from '@/lib/api/api-error';
import {
  activeLookups,
  findLookupByName,
  type Lookup,
} from '@/lib/inventory-lookup';
import { usePermission } from '@/lib/permissions';

interface LookupSelectProps {
  /** "Categoría", "Marca": rotula el campo y los textos de alta. */
  label: string;
  required?: boolean;
  /** Texto de la opción vacía ("— Seleccionar —", "Sin marca"). */
  emptyLabel: string;
  items: readonly Lookup[];
  loading?: boolean;
  value: string;
  onChange: (id: string) => void;
  /** Alta en el momento; solo se ofrece a quien tiene `managePermission`. */
  create: (name: string) => Promise<Lookup>;
  managePermission: string;
  queryKey: readonly string[];
  disabled?: boolean;
}

/** Selector de categoría o marca que permite dar de alta una sin salir del formulario. */
export function LookupSelect({
  label,
  required,
  emptyLabel,
  items,
  loading,
  value,
  onChange,
  create,
  managePermission,
  queryKey,
  disabled,
}: LookupSelectProps) {
  const queryClient = useQueryClient();
  const canManage = usePermission(managePermission);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const lower = label.toLowerCase();
  const selected = items.find((item) => item.id === value);

  function close() {
    setAdding(false);
    setName('');
    setError('');
  }

  const mutation = useMutation({
    mutationFn: () => create(name.trim()),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: [...queryKey] });
      onChange(created.id);
      close();
    },
    onError: (err) => setError(apiErrorMessage(err, `No se pudo crear la ${lower}`)),
  });

  function add() {
    if (!name.trim() || mutation.isPending) return;
    // Si ya existe, alcanza con elegirla.
    const existing = findLookupByName(items, name);
    if (existing) {
      onChange(existing.id);
      close();
      return;
    }
    setError('');
    mutation.mutate();
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label>
          {label}
          {required ? ' *' : ''}
        </Label>
        {canManage && !adding && !disabled && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 rounded text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <Plus size={12} aria-hidden />
            Nueva
          </button>
        )}
      </div>

      {adding ? (
        <>
          <div className="flex items-center gap-1.5">
            <Input
              autoFocus
              aria-label={`Nombre de la nueva ${lower}`}
              placeholder={`Nueva ${lower}...`}
              value={name}
              disabled={mutation.isPending}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                // Enter no debe enviar el formulario que contiene al selector.
                if (e.key === 'Enter') {
                  e.preventDefault();
                  add();
                }
                if (e.key === 'Escape') {
                  e.stopPropagation();
                  close();
                }
              }}
            />
            <Button
              type="button"
              size="sm"
              onClick={add}
              disabled={!name.trim() || mutation.isPending}
            >
              {mutation.isPending ? 'Agregando...' : 'Agregar'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={close}
              disabled={mutation.isPending}
            >
              Cancelar
            </Button>
          </div>
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
        </>
      ) : (
        <Select
          value={value || 'none'}
          onValueChange={(next) => onChange(next && next !== 'none' ? next : '')}
        >
          <SelectTrigger className="w-full" aria-label={label} disabled={disabled}>
            <span className="min-w-0 flex-1 truncate text-left text-sm">
              {selected?.name ?? (loading ? 'Cargando...' : emptyLabel)}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{emptyLabel}</SelectItem>
            {activeLookups(items, value).map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
