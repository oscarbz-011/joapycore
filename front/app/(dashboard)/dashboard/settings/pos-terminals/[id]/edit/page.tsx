'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/api-error';
import { posApi } from '@/lib/api/pos';
import { Button } from '@/components/ui/button';
import { PosTerminalForm } from '../../_form';

export default function EditPosTerminalPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const back = () => router.push('/dashboard/settings/pos-terminals');

  // Son pocas cajas por empresa: alcanza con la lista.
  const { data: terminals, isLoading, error } = useQuery({
    queryKey: ['pos-terminals'],
    queryFn: posApi.listTerminals,
  });
  const terminal = terminals?.find((t) => t.id === id);

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={back} aria-label="Volver">
          <ArrowLeft size={18} />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{terminal?.name ?? 'Caja'}</h1>
          {terminal && <p className="mt-1 text-sm text-muted-foreground">{terminal.branch.name}</p>}
        </div>
      </div>

      {isLoading && <div className="py-16 text-center text-sm text-muted-foreground">Cargando…</div>}
      {error && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {apiErrorMessage(error, 'No se pudo cargar la caja')}
        </div>
      )}
      {terminals && !terminal && (
        <p className="py-16 text-center text-sm text-muted-foreground">La caja no existe.</p>
      )}
      {terminal && <PosTerminalForm key={terminal.id} terminal={terminal} onDone={back} />}
    </div>
  );
}
