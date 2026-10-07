'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Plus, Search, RotateCw } from 'lucide-react';
import { SortableHeader } from '@/components/sortable-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  CUSTOMER_SORT,
  customerFullName,
  documentTypeLabel,
  filterCustomers,
} from '@/lib/customers';
import { useTableSort } from '@/lib/use-table-sort';
import { salesApi } from '../../../../../lib/api/sales';

const EMPTY = <span className="text-muted-foreground">—</span>;

export default function CustomersPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');

  const { data: customers = [], isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['sale-customers'],
    queryFn: salesApi.listCustomers,
  });

  const filtered = filterCustomers(customers, search);
  const { sorted, sort, toggle } = useTableSort(filtered, CUSTOMER_SORT);

  const newCustomer = () => router.push('/dashboard/sales/customers/new');

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Clientes</h1>
          <p className="mt-1 text-sm text-muted-foreground">Gestión de clientes</p>
        </div>
        <Button onClick={newCustomer}>
          <Plus size={16} />
          Nuevo cliente
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1 sm:max-w-md">
          <Search
            size={14}
            aria-hidden
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50"
          />
          <Input
            className="pl-8"
            aria-label="Buscar cliente"
            placeholder="Buscar por nombre, documento, código, email o teléfono..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {!isLoading && !isError && (
          <p className="text-sm text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? 'cliente' : 'clientes'}
          </p>
        )}
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
      ) : customers.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm text-muted-foreground">Todavía no hay clientes cargados.</p>
          <Button variant="outline" className="mt-4" onClick={newCustomer}>
            <Plus size={15} />
            Crear el primero
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm text-muted-foreground">
            Ningún cliente coincide con &ldquo;{search.trim()}&rdquo;.
          </p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => setSearch('')}>
            Limpiar búsqueda
          </Button>
        </div>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  <SortableHeader label="Código" sortKey="code" sort={sort} onSort={toggle} />
                  <SortableHeader label="Cliente" sortKey="name" sort={sort} onSort={toggle} />
                  <SortableHeader label="Tipo de doc." sortKey="documentType" sort={sort} onSort={toggle} className="whitespace-nowrap" />
                  <SortableHeader label="Documento" sortKey="document" sort={sort} onSort={toggle} />
                  <SortableHeader label="Teléfono" sortKey="phone" sort={sort} onSort={toggle} />
                  <SortableHeader label="Email" sortKey="email" sort={sort} onSort={toggle} />
                  <SortableHeader label="Ciudad" sortKey="city" sort={sort} onSort={toggle} />
                  <SortableHeader label="Estado" sortKey="status" sort={sort} onSort={toggle} />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sorted.map((customer) => {
                  const open = () => router.push(`/dashboard/sales/customers/${customer.id}/edit`);
                  return (
                    <tr
                      key={customer.id}
                      tabIndex={0}
                      onClick={open}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') open();
                      }}
                      className="cursor-pointer transition-colors hover:bg-muted/20 focus-visible:bg-muted/20 focus-visible:outline-none"
                    >
                      <td className="px-4 py-3 font-mono text-xs whitespace-nowrap text-muted-foreground">
                        {customer.customerCode ?? EMPTY}
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground">
                        {customerFullName(customer)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-foreground">
                        {documentTypeLabel(customer.documentType) ?? EMPTY}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap tabular-nums text-foreground">
                        {customer.documentNumber ?? EMPTY}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-foreground">
                        {customer.phone ?? EMPTY}
                      </td>
                      <td className="px-4 py-3 text-foreground">{customer.email ?? EMPTY}</td>
                      <td className="px-4 py-3 text-foreground">{customer.city ?? EMPTY}</td>
                      <td className="px-4 py-3">
                        <Badge variant={customer.isActive ? 'secondary' : 'outline'}>
                          {customer.isActive ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
