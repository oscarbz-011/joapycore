'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, FolderOpen, Pencil, Plus, Trash2, X } from 'lucide-react';
import { documentCategoriesApi, type DocumentCategory } from '../../lib/api/documents';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function CategoriesTab() {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ['document-categories'],
    queryFn: documentCategoriesApi.list,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['document-categories'] });

  const createMutation = useMutation({
    mutationFn: () => documentCategoriesApi.create(name.trim()),
    onSuccess: () => { setName(''); setError(''); invalidate(); },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      setError(err?.response?.data?.message ?? 'Error al crear categoría');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, name: newName }: { id: string; name: string }) => documentCategoriesApi.update(id, newName),
    onSuccess: () => { invalidate(); setEditingId(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => documentCategoriesApi.remove(id),
    onSuccess: invalidate,
  });

  function startEdit(category: DocumentCategory) {
    setEditingId(category.id);
    setEditName(category.name);
  }

  return (
    <div className="max-w-lg rounded-2xl border border-border bg-card p-5">
      <h2 className="mb-4 text-[13.5px] font-semibold text-foreground">Categorías de documentos</h2>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          createMutation.mutate();
        }}
        className="mb-4 flex gap-2"
      >
        <Input
          className="flex-1"
          placeholder="Nombre de la categoría..."
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <Button type="submit" size="sm" disabled={createMutation.isPending}>
          <Plus size={14} />
          Agregar
        </Button>
      </form>
      {error && <p className="mb-3 text-[12px] text-destructive">{error}</p>}

      {isLoading ? (
        <p className="py-4 text-center text-[13px] text-muted-foreground/60">Cargando categorías...</p>
      ) : categories.length === 0 ? (
        <div className="py-8 text-center">
          <FolderOpen size={32} className="mx-auto mb-2 text-muted-foreground/30" />
          <p className="text-[13px] text-muted-foreground">Aún no hay categorías creadas.</p>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {categories.map((category) => (
            <li
              key={category.id}
              className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2"
            >
              {editingId === category.id ? (
                <>
                  <Input
                    autoFocus
                    className="h-8"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && editName.trim()) {
                        updateMutation.mutate({ id: category.id, name: editName.trim() });
                      }
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                  />
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => editName.trim() && updateMutation.mutate({ id: category.id, name: editName.trim() })}
                      className="rounded-lg p-1.5 text-muted-foreground/60 transition-colors hover:bg-muted/20 hover:text-accent-on"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="rounded-lg p-1.5 text-muted-foreground/60 transition-colors hover:bg-muted/20 hover:text-foreground"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <span className="truncate text-[13.5px] text-foreground">{category.name}</span>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => startEdit(category)}
                      title="Renombrar"
                      className="rounded-lg p-1.5 text-muted-foreground/60 transition-colors hover:bg-muted/20 hover:text-foreground"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => confirm(`¿Eliminar la categoría "${category.name}"?`) && deleteMutation.mutate(category.id)}
                      title="Eliminar"
                      className="rounded-lg p-1.5 text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
