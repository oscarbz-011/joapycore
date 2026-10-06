'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { SupplierForm } from '@/components/procurement/supplier-form';
import { Button } from '@/components/ui/button';
import { procurementApi } from '@/lib/api/procurement';

export default function EditSupplierPage() {
  const { id } = useParams<{ id: string }>();
  const {
    data: supplier,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['supplier', id],
    queryFn: () => procurementApi.getSupplier(id),
  });

  if (isLoading) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">Cargando proveedor...</div>
    );
  }

  if (isError || !supplier) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-muted-foreground">
          {isError ? 'No se pudo cargar el proveedor.' : 'No se encontró el proveedor.'}
        </p>
        <div className="mt-3 flex justify-center gap-2">
          {isError && (
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Reintentar
            </Button>
          )}
          <Link
            href="/dashboard/procurement/suppliers"
            className="inline-flex h-8 items-center rounded-3xl border border-border px-3 text-sm font-medium text-foreground hover:bg-muted/30"
          >
            Ver todos los proveedores
          </Link>
        </div>
      </div>
    );
  }

  // key: el formulario arranca de los datos recién cargados de este proveedor.
  return <SupplierForm key={supplier.id} supplier={supplier} />;
}
