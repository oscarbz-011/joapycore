import type { CreateSupplierPayload, Supplier } from './api/procurement';
import type { SortValue } from './table-sort';

/** Valores del formulario de proveedor; el plazo se edita como texto. */
export interface SupplierForm {
  name: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  taxId: string;
  isImporter: boolean;
  paymentTermDays: string;
}

export function emptySupplierForm(): SupplierForm {
  return {
    name: '',
    contactName: '',
    email: '',
    phone: '',
    address: '',
    taxId: '',
    isImporter: false,
    paymentTermDays: '0',
  };
}

export function supplierFormFrom(supplier: Supplier): SupplierForm {
  return {
    name: supplier.name,
    contactName: supplier.contactName ?? '',
    email: supplier.email ?? '',
    phone: supplier.phone ?? '',
    address: supplier.address ?? '',
    taxId: supplier.taxId ?? '',
    isImporter: supplier.isImporter,
    paymentTermDays: String(supplier.paymentTermDays ?? 0),
  };
}

const optional = (value: string) => value.trim() || null;

// Los opcionales vacíos viajan como null y no se omiten: al editar, un campo
// ausente se ignora y el dato viejo no se podría borrar.
export function toSupplierPayload(form: SupplierForm): CreateSupplierPayload {
  const days = Math.trunc(Number(form.paymentTermDays));
  return {
    name: form.name.trim(),
    contactName: optional(form.contactName),
    email: optional(form.email),
    phone: optional(form.phone),
    address: optional(form.address),
    taxId: optional(form.taxId),
    isImporter: form.isImporter,
    paymentTermDays: Number.isFinite(days) && days > 0 ? days : 0,
  };
}

/** 0 (o sin dato) es contado: la cuenta por pagar vence el día de la recepción. */
export function paymentTermLabel(days: number | null): string {
  if (!days) return 'Contado';
  return `${days} ${days === 1 ? 'día' : 'días'}`;
}

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

export function filterSuppliers(
  suppliers: readonly Supplier[],
  search: string,
): Supplier[] {
  const term = normalize(search.trim());
  if (!term) return [...suppliers];
  return suppliers.filter((supplier) =>
    normalize(
      [supplier.name, supplier.contactName, supplier.email, supplier.taxId]
        .filter(Boolean)
        .join(' '),
    ).includes(term),
  );
}

export type SupplierSortKey = 'name' | 'contact' | 'taxId' | 'term' | 'status';

export const SUPPLIER_SORT: Record<
  SupplierSortKey,
  (supplier: Supplier) => SortValue
> = {
  name: (supplier) => supplier.name,
  contact: (supplier) => supplier.contactName ?? supplier.email,
  taxId: (supplier) => supplier.taxId,
  term: (supplier) => supplier.paymentTermDays ?? 0,
  status: (supplier) => supplier.isActive,
};
