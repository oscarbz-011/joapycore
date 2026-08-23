'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CustomerForm } from '../_form';
import type { Customer } from '../../../../../../lib/api/sales';

export default function NewCustomerPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get('returnTo');
  const back = () => router.push('/dashboard/sales/customers');

  function handleDone(customer?: Customer) {
    if (returnTo && customer) {
      sessionStorage.setItem('sales:new-order-draft-customer-id', customer.id);
      router.push(returnTo);
      return;
    }
    back();
  }

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

      <CustomerForm onDone={handleDone} />
    </div>
  );
}
