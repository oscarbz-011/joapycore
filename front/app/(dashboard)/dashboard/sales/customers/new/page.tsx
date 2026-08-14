'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CustomerForm } from '../_form';

export default function NewCustomerPage() {
  const router = useRouter();
  const back = () => router.push('/dashboard/sales/customers');

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={back}>
          <ArrowLeft size={18} />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Nuevo cliente</h1>
          <p className="mt-1 text-sm text-muted-foreground">El código se genera automáticamente</p>
        </div>
      </div>

      <CustomerForm onDone={back} />
    </div>
  );
}
