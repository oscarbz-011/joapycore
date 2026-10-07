import type { Customer, DocumentType } from './api/sales';
import type { SortValue } from './table-sort';

type Named = Pick<
  Customer,
  'firstName' | 'secondFirstName' | 'lastName' | 'secondLastName'
>;

/** Nombres y apellidos completos, sin espacios de más. */
export function customerFullName(customer: Named): string {
  return [
    customer.firstName,
    customer.secondFirstName,
    customer.lastName,
    customer.secondLastName,
  ]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ');
}

const DOCUMENT_TYPE_LABEL: Record<DocumentType, string> = {
  CI: 'C.I.',
  RUC: 'RUC',
  PASSPORT: 'Pasaporte',
};

export function documentTypeLabel(type: DocumentType | null): string | null {
  return type ? (DOCUMENT_TYPE_LABEL[type] ?? type) : null;
}

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** Busca por nombre, documento, código, email o teléfono, sin distinguir acentos. */
export function filterCustomers(
  customers: readonly Customer[],
  search: string,
): Customer[] {
  const term = normalize(search.trim());
  if (!term) return [...customers];
  return customers.filter((customer) =>
    normalize(
      [
        customerFullName(customer),
        customer.documentNumber,
        customer.customerCode,
        customer.email,
        customer.phone,
      ]
        .filter(Boolean)
        .join(' '),
    ).includes(term),
  );
}

export type CustomerSortKey =
  | 'code'
  | 'name'
  | 'documentType'
  | 'document'
  | 'phone'
  | 'email'
  | 'city'
  | 'status';

export const CUSTOMER_SORT: Record<
  CustomerSortKey,
  (customer: Customer) => SortValue
> = {
  code: (customer) => customer.customerCode,
  // Por apellido primero, como se busca a una persona en una lista.
  name: (customer) =>
    [
      customer.lastName,
      customer.secondLastName,
      customer.firstName,
      customer.secondFirstName,
    ]
      .filter(Boolean)
      .join(' '),
  documentType: (customer) => documentTypeLabel(customer.documentType),
  document: (customer) => customer.documentNumber,
  phone: (customer) => customer.phone,
  email: (customer) => customer.email,
  city: (customer) => customer.city,
  status: (customer) => customer.isActive,
};
