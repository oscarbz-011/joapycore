'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { salesApi } from '../../../../../../../lib/api/sales';
import { Button } from '@/components/ui/button';
import { CustomerForm } from '../../_form';

export default function EditCustomerPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const back = () => router.push('/dashboard/sales/customers');

  const { data: customer, isLoading } = useQuery({
    queryKey: ['sale-customer', id],
    queryFn: () => salesApi.getCustomer(id),
  });

  if (isLoading) {
    return <div className="py-16 text-center text-sm text-muted-foreground/60">Cargando...</div>;
  }

  if (!customer) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-muted-foreground/60">Cliente no encontrado.</p>
        <button type="button" onClick={back} className="mt-3 text-sm font-medium text-foreground underline underline-offset-2">
          Volver a clientes
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={back}>
          <ArrowLeft size={18} />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            {customer.firstName} {customer.secondFirstName ? `${customer.secondFirstName} ` : ''}{customer.lastName}{customer.secondLastName ? ` ${customer.secondLastName}` : ''}
          </h1>
          {customer.customerCode && (
            <p className="mt-0.5 text-sm text-muted-foreground font-mono">{customer.customerCode}</p>
          )}
        </div>
      </div>

      <CustomerForm key={customer.id} initial={customer} onDone={back} />
    </div>
  );
}
