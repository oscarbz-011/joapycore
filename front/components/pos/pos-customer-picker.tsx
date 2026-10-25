'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, UserPlus, X } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/api-error';
import { salesApi, type Customer, type DocumentType, type TaxpayerType } from '@/lib/api/sales';
import { usePermission } from '@/lib/permissions';
import {
  EMPTY_QUICK_CUSTOMER,
  buyerSummary,
  quickCustomerPayload,
  quickCustomerProblem,
  withTaxpayerType,
  type QuickCustomerForm,
} from '@/lib/pos-customer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';

const SEARCH_DELAY_MS = 300;
const DOCUMENT_LABELS: Record<DocumentType, string> = { CI: 'C.I.', RUC: 'RUC', PASSPORT: 'Pasaporte' };
const TAXPAYER_LABELS: Record<TaxpayerType, string> = {
  INDIVIDUAL: 'Persona física',
  COMPANY: 'Persona jurídica',
};

function useDebounced(value: string): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [value]);
  return debounced;
}

function QuickCustomer({ onCreated, onCancel }: Readonly<{ onCreated: (c: Customer) => void; onCancel: () => void }>) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<QuickCustomerForm>(EMPTY_QUICK_CUSTOMER);
  const [touched, setTouched] = useState(false);
  const problem = quickCustomerProblem(form);
  const company = form.taxpayerType === 'COMPANY';

  const create = useMutation({
    mutationFn: () => salesApi.createCustomer(quickCustomerPayload(form)),
    onSuccess: (customer) => {
      void queryClient.invalidateQueries({ queryKey: ['sale-customers'] });
      onCreated(customer);
    },
  });

  const set = <K extends keyof QuickCustomerForm>(key: K, value: QuickCustomerForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label>Tipo</Label>
          <Select value={form.taxpayerType} onValueChange={(v) => v && setForm((f) => withTaxpayerType(f, v as TaxpayerType))}>
            <SelectTrigger className="w-full" aria-label="Tipo de contribuyente">
              <span className="flex-1 truncate text-left text-sm">{TAXPAYER_LABELS[form.taxpayerType]}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="INDIVIDUAL">Persona física</SelectItem>
              <SelectItem value="COMPANY">Persona jurídica</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Documento</Label>
          <Select
            value={form.documentType}
            disabled={company}
            onValueChange={(v) => v && set('documentType', v as DocumentType)}
          >
            <SelectTrigger className="w-full" aria-label="Tipo de documento">
              <span className="flex-1 truncate text-left text-sm">{DOCUMENT_LABELS[form.documentType]}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="CI">C.I.</SelectItem>
              <SelectItem value="RUC">RUC</SelectItem>
              <SelectItem value="PASSPORT">Pasaporte</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="quick-doc">Número</Label>
        <Input
          id="quick-doc"
          value={form.documentNumber}
          onChange={(e) => set('documentNumber', e.target.value)}
          placeholder={form.documentType === 'RUC' ? '80012345-6' : '1234567'}
        />
      </div>
      {company ? (
        <div className="space-y-1">
          <Label htmlFor="quick-name">Razón social</Label>
          <Input id="quick-name" value={form.firstName} onChange={(e) => set('firstName', e.target.value)} />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="quick-first">Nombre</Label>
            <Input id="quick-first" value={form.firstName} onChange={(e) => set('firstName', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="quick-last">Apellido</Label>
            <Input id="quick-last" value={form.lastName} onChange={(e) => set('lastName', e.target.value)} />
          </div>
        </div>
      )}
      {touched && problem && <p className="text-xs text-destructive">{problem}</p>}
      {create.isError && (
        <p role="alert" className="text-xs text-destructive">
          {apiErrorMessage(create.error, 'No se pudo crear el cliente')}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={create.isPending}
          onClick={() => {
            setTouched(true);
            if (!problem) create.mutate();
          }}
        >
          {create.isPending ? 'Guardando…' : 'Guardar cliente'}
        </Button>
      </div>
    </div>
  );
}

/** Comprador de la factura: un cliente buscado por nombre o documento, o "Sin Nombre". */
export function PosCustomerPicker({
  value,
  onChange,
}: Readonly<{ value: Customer | null; onChange: (customer: Customer | null) => void }>) {
  const canCreate = usePermission('customers:create');
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const search = useDebounced(query.trim());

  const results = useQuery({
    queryKey: ['pos-customer-search', search],
    queryFn: () => salesApi.pageCustomers({ page: 1, limit: 8, q: search }),
    enabled: search.length >= 2,
  });

  if (value) {
    const buyer = buyerSummary(value);
    return (
      <div className="flex items-start justify-between gap-2 rounded-lg border border-border px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{buyer.name}</p>
          <p className="text-xs text-muted-foreground">{buyer.document}</p>
        </div>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="rounded p-1 text-muted-foreground hover:bg-muted/20 hover:text-foreground"
          aria-label="Quitar cliente y facturar a Consumidor Final"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  if (creating) {
    return (
      <QuickCustomer
        onCancel={() => setCreating(false)}
        onCreated={(customer) => {
          setCreating(false);
          setQuery('');
          onChange(customer);
        }}
      />
    );
  }

  const items = results.data?.items ?? [];
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Consumidor Final: la factura sale a nombre de &quot;Sin Nombre&quot; con X en el documento.
      </p>
      <div className="relative">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar cliente por nombre, C.I. o RUC"
          aria-label="Buscar cliente"
          className="pl-8"
        />
      </div>
      {search.length >= 2 && (
        <div className="max-h-56 overflow-y-auto rounded-lg border border-border" role="listbox" aria-label="Clientes">
          {results.isLoading ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">Buscando…</p>
          ) : results.isError ? (
            <p role="alert" className="px-3 py-2 text-xs text-destructive">
              {apiErrorMessage(results.error, 'No se pudo buscar')}
            </p>
          ) : items.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">Sin clientes que coincidan</p>
          ) : (
            items.map((customer) => {
              const buyer = buyerSummary(customer);
              return (
                <button
                  key={customer.id}
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => onChange(customer)}
                  className="block w-full px-3 py-2 text-left hover:bg-muted/20 focus:bg-muted/20 focus:outline-none"
                >
                  <span className="block truncate text-sm text-foreground">{buyer.name}</span>
                  <span className="block text-xs text-muted-foreground">{buyer.document}</span>
                </button>
              );
            })
          )}
        </div>
      )}
      {canCreate && (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
        >
          <UserPlus size={13} /> Nuevo cliente
        </button>
      )}
    </div>
  );
}
