'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Plus, Search, RotateCw } from 'lucide-react';
import { salesApi, type Customer, type DocumentType } from '../../../../../lib/api/sales';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

function docLabel(type: DocumentType): string {
  return type === 'CI' ? 'C.I.' : type === 'RUC' ? 'RUC' : 'Pasaporte';
}

export default function CustomersPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');

  const { data: customers = [], isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['sale-customers'],
    queryFn: salesApi.listCustomers,
  });

  const filtered = customers.filter((c: Customer) => {
    const haystack =
      `${c.firstName} ${c.lastName} ${c.email ?? ''} ${c.documentNumber ?? ''} ${c.customerCode ?? ''}`.toLowerCase();
    return !search || haystack.includes(search.toLowerCase());
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Clientes</h1>
          <p className="mt-1 text-sm text-muted-foreground">Gestión de clientes</p>
        </div>
        <Button onClick={() => router.push('/dashboard/sales/customers/new')}>
          <Plus size={16} />
          Nuevo cliente
        </Button>
      </div>

      <div className="relative mb-4">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
        <Input
          className="pl-8"
          placeholder="Buscar por nombre, documento o código..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-sm text-muted-foreground/60">Cargando clientes...</div>
      ) : isError ? (
        // Distinto de "sin resultados" a propósito — antes un error acá
        // (401 durante el refresh de token, timeout, backend reiniciando)
        // caía silenciosamente al [] por default y se veía igual que una
        // lista vacía, sin forma de saber que en realidad falló la consulta.
        <div className="py-16 text-center">
          <p className="text-sm text-destructive">
            {(error as Error)?.message ?? 'No se pudo cargar la lista de clientes.'}
          </p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetch()} disabled={isFetching}>
            <RotateCw size={14} className={isFetching ? 'animate-spin' : ''} />
            {isFetching ? 'Reintentando...' : 'Reintentar'}
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm text-muted-foreground/60">No se encontraron clientes.</p>
          <button
            type="button"
            onClick={() => router.push('/dashboard/sales/customers/new')}
            className="mt-3 text-sm font-medium text-foreground underline underline-offset-2"
          >
            Crear el primero
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <ul className="divide-y divide-border">
            {filtered.map((customer: Customer) => (
              <li
                key={customer.id}
                onClick={() => router.push(`/dashboard/sales/customers/${customer.id}/edit`)}
                className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/20 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-foreground truncate">
                      {customer.firstName}
                      {customer.secondFirstName ? ` ${customer.secondFirstName}` : ''}{' '}
                      {customer.lastName}
                      {customer.secondLastName ? ` ${customer.secondLastName}` : ''}
                    </p>
                    {customer.customerCode && (
                      <span className="shrink-0 text-xs text-muted-foreground/60 font-mono">
                        {customer.customerCode}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground/60 truncate">
                    {[
                      customer.documentType && customer.documentNumber
                        ? `${docLabel(customer.documentType)}: ${customer.documentNumber}`
                        : null,
                      customer.phone,
                      customer.email,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                {!customer.isActive && (
                  <Badge variant="outline" className="ml-3 bg-muted/30 text-muted-foreground border-border shrink-0">
                    Inactivo
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
