'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePermission } from '@/lib/permissions';
import { BillingSeriesForm } from '../_form';

export default function NewBillingSeriesPage() {
  const router = useRouter();
  const canManage = usePermission('billing:series:manage');
  const back = () => router.push('/dashboard/settings/billing-series');

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={back} aria-label="Volver">
          <ArrowLeft size={18} />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Nueva serie</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cargá el timbrado tal como figura en la autorización de la DNIT.
          </p>
        </div>
      </div>
      <BillingSeriesForm canManage={canManage} onDone={back} />
    </div>
  );
}
