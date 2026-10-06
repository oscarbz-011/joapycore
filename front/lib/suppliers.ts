import type { CreateSupplierPayload, Supplier } from './api/procurement';
import {
  numberOrNull,
  tierRowsError,
  tierRowsFrom,
  tierRowsTo,
  type TierRow,
} from './commercial-terms';
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
  // Condiciones comerciales: vacío = no se sabe.
  shippingCost: string;
  leadTimeDays: string;
  minOrderAmount: string;
  /** Descuentos por total de la orden: desde (Gs.) → porcentaje. */
  volumeDiscounts: TierRow[];
  /** Descuentos por unidades de la orden: desde (unidades) → porcentaje. */
  quantityDiscounts: TierRow[];
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
    shippingCost: '',
    leadTimeDays: '',
    minOrderAmount: '',
    volumeDiscounts: [],
    quantityDiscounts: [],
  };
}

const text = (value: number | null) => (value === null ? '' : String(value));

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
    shippingCost: text(supplier.shippingCost),
    leadTimeDays: text(supplier.leadTimeDays),
    minOrderAmount: text(supplier.minOrderAmount),
    volumeDiscounts: tierRowsFrom(
      supplier.volumeDiscounts,
      'minAmount',
      'percent',
    ),
    quantityDiscounts: tierRowsFrom(
      supplier.quantityDiscounts,
      'minQuantity',
      'percent',
    ),
  };
}

/** Problema en las condiciones comerciales, o null si están bien. */
export function supplierTermsError(form: SupplierForm): string | null {
  const amounts = [form.shippingCost, form.leadTimeDays, form.minOrderAmount];
  if (amounts.some((value) => (numberOrNull(value) ?? 0) < 0)) {
    return 'El envío, el plazo de entrega y el pedido mínimo no pueden ser negativos';
  }
  const discounts =
    tierRowsError(form.volumeDiscounts) ??
    tierRowsError(form.quantityDiscounts);
  if (discounts) return discounts;
  const all = [...form.volumeDiscounts, ...form.quantityDiscounts];
  if (all.some((row) => Number(row.value) > 100)) {
    return 'Un descuento no puede superar el 100%';
  }
  // Las unidades se cuentan enteras: "desde 2,5 unidades" no existe.
  if (
    form.quantityDiscounts.some(
      (row) => row.from.trim() && !Number.isInteger(Number(row.from)),
    )
  ) {
    return 'La cantidad de un descuento tiene que ser un número entero';
  }
  return null;
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
    shippingCost: numberOrNull(form.shippingCost),
    leadTimeDays: wholeOrNull(form.leadTimeDays),
    minOrderAmount: numberOrNull(form.minOrderAmount),
    volumeDiscounts: tierRowsTo(form.volumeDiscounts, 'minAmount', 'percent'),
    quantityDiscounts: tierRowsTo(
      form.quantityDiscounts,
      'minQuantity',
      'percent',
    ),
  };
}

function wholeOrNull(value: string): number | null {
  const n = numberOrNull(value);
  return n === null ? null : Math.trunc(n);
}

/** "7 días", o "Sin dato" si el proveedor no lo informó. */
export function leadTimeLabel(days: number | null): string {
  if (days === null) return 'Sin dato';
  if (days === 0) return 'Inmediata';
  return `${days} ${days === 1 ? 'día' : 'días'}`;
}

/** 0 (o sin dato) es contado: la cuenta por pagar vence el día de la recepción. */
export function paymentTermLabel(days: number | null): string {
  if (!days) return 'Contado';
  return `${days} ${days === 1 ? 'día' : 'días'}`;
}

/** Iniciales para el distintivo del proveedor (no hay logo cargado). */
export function supplierInitials(name: string): string {
  const words = name
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean);
  if (words.length === 0) return '?';
  const initials =
    words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0];
  return initials.toUpperCase();
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

export type SupplierSortKey =
  | 'name'
  | 'contact'
  | 'email'
  | 'phone'
  | 'taxId'
  | 'term'
  | 'type'
  | 'status';

export const SUPPLIER_SORT: Record<
  SupplierSortKey,
  (supplier: Supplier) => SortValue
> = {
  name: (supplier) => supplier.name,
  contact: (supplier) => supplier.contactName,
  email: (supplier) => supplier.email,
  phone: (supplier) => supplier.phone,
  taxId: (supplier) => supplier.taxId,
  term: (supplier) => supplier.paymentTermDays ?? 0,
  type: (supplier) => supplier.isImporter,
  status: (supplier) => supplier.isActive,
};
