'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/api-error';
import { branchesApi } from '@/lib/api/branches';
import { posApi } from '@/lib/api/pos';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';

export default function NewPosTerminalPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const back = () => router.push('/dashboard/settings/pos-terminals');
  const [name, setName] = useState('');
  const [branchId, setBranchId] = useState('');
  const [error, setError] = useState('');

  const { data: branches = [], isLoading } = useQuery({ queryKey: ['branches'], queryFn: branchesApi.listBranches });
  const selectedBranch = branchId || branches[0]?.id || '';

  const create = useMutation({
    mutationFn: () => posApi.createTerminal({ name: name.trim(), branchId: selectedBranch }),
    onSuccess: async (terminal) => {
      await queryClient.invalidateQueries({ queryKey: ['pos-terminals'] });
      // La serie y la impresión se eligen después: la serie tiene que ser de la sucursal de la caja.
      router.push(`/dashboard/settings/pos-terminals/${terminal.id}/edit`);
    },
    onError: (err) => setError(apiErrorMessage(err, 'No se pudo crear la caja')),
  });

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={back} aria-label="Volver">
          <ArrowLeft size={18} />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Nueva caja</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Después de crearla le asignás la serie de facturas y el formato de impresión.
          </p>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError('');
          create.mutate();
        }}
      >
        <Card className="space-y-4 p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="terminal-name">Nombre *</Label>
              <Input id="terminal-name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Caja 1" />
            </div>
            <div className="space-y-1.5">
              <Label>Sucursal *</Label>
              <Select value={selectedBranch} onValueChange={(v) => setBranchId(v ?? '')} disabled={isLoading}>
                <SelectTrigger className="w-full" aria-label="Sucursal">
                  <span className="flex-1 truncate text-left text-sm">
                    {branches.find((b) => b.id === selectedBranch)?.name ?? 'Seleccionar sucursal'}
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
          </div>

          {error && (
            <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={back}>
              Cancelar
            </Button>
            <Button type="submit" disabled={create.isPending || !selectedBranch || !name.trim()}>
              {create.isPending ? 'Creando…' : 'Crear caja'}
            </Button>
          </div>
        </Card>
      </form>
    </div>
  );
}
