'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { documentCategoriesApi } from '../../lib/api/documents';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';

const NONE = '__none__';

export function CategorySelect({
  value,
  onChange,
}: {
  value?: string;
  onChange: (categoryId: string | undefined) => void;
}) {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const { data: categories = [] } = useQuery({
    queryKey: ['document-categories'],
    queryFn: documentCategoriesApi.list,
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => documentCategoriesApi.create(name),
    onSuccess: (category) => {
      qc.invalidateQueries({ queryKey: ['document-categories'] });
      onChange(category.id);
      setCreating(false);
      setNewName('');
    },
  });

  const selected = categories.find((c) => c.id === value);

  if (creating) {
    return (
      <div className="flex gap-2">
        <Input
          autoFocus
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Nombre de la categoría"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && newName.trim()) createMutation.mutate(newName.trim());
            if (e.key === 'Escape') setCreating(false);
          }}
        />
        <Button
          type="button"
          size="sm"
          disabled={!newName.trim() || createMutation.isPending}
          onClick={() => createMutation.mutate(newName.trim())}
        >
          {createMutation.isPending ? 'Creando...' : 'Crear'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setCreating(false)}>
          Cancelar
        </Button>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <Select value={value ?? NONE} onValueChange={(v) => v && onChange(v === NONE ? undefined : v)}>
        <SelectTrigger className="w-full">
          <span className="flex-1 text-left text-sm truncate">
            {selected?.name ?? 'Sin categoría'}
          </span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Sin categoría</SelectItem>
          {categories.map((c) => (
            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="button" variant="outline" size="icon" onClick={() => setCreating(true)} title="Nueva categoría">
        <Plus size={14} />
      </Button>
    </div>
  );
}
