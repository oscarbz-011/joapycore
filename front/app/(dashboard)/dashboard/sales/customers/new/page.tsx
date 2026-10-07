'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CustomerForm } from '../_form';
import type { Customer } from '../../../../../../lib/api/sales';
import { CUSTOMER_PREFILL_KEY, type CustomerPrefill } from '@/lib/quote-party';

export default function NewCustomerPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get('returnTo');
  const back = () => router.push('/dashboard/sales/customers');

  // Datos que deja quien pidió el alta (un presupuesto sin cliente
  // registrado). undefined = todavía no se leyó; el formulario espera.
  const [prefill, setPrefill] = useState<CustomerPrefill | null | undefined>(undefined);
  useEffect(() => {
    const raw = sessionStorage.getItem(CUSTOMER_PREFILL_KEY);
    sessionStorage.removeItem(CUSTOMER_PREFILL_KEY);
    let parsed: CustomerPrefill | null = null;
    try {
      parsed = raw ? (JSON.parse(raw) as CustomerPrefill) : null;
    } catch {
      // Dato corrupto: se arranca en blanco.
    }
    // Lectura de sessionStorage al montar: es sincronizar con un sistema
    // externo (no derivable en el render, que también corre en el servidor).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPrefill(parsed);
  }, []);

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

      {prefill !== undefined && <CustomerForm prefill={prefill ?? undefined} onDone={handleDone} />}
    </div>
  );
}
