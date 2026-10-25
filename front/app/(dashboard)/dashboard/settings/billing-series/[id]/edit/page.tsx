'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiErrorMessage } from '@/lib/api/api-error';
import { billingApi } from '@/lib/api/billing';
import { seriesCode } from '@/lib/billing-series';
import { usePermission } from '@/lib/permissions';
import { BillingSeriesForm } from '../../_form';

export default function EditBillingSeriesPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const canManage = usePermission('billing:series:manage');
  const back = () => router.push('/dashboard/settings/billing-series');

  const { data: series, isLoading, error } = useQuery({
    queryKey: ['billing-series', id],
    queryFn: () => billingApi.getSeries(id),
  });

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={back} aria-label="Volver">
          <ArrowLeft size={18} />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            {series ? `Serie ${seriesCode(series)}` : 'Serie'}
          </h1>
          {series && (
            <p className="mt-1 text-sm text-muted-foreground">
              {series.branch.name} · {series._count.invoices} factura(s) numeradas
            </p>
          )}
        </div>
      </div>

      {isLoading && <div className="py-16 text-center text-sm text-muted-foreground">Cargando…</div>}
      {error && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {apiErrorMessage(error, 'No se pudo cargar la serie')}
        </div>
      )}
      {series && <BillingSeriesForm series={series} canManage={canManage} onDone={back} />}
    </div>
  );
}
