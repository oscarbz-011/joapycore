import type { Customer, DocumentType } from './api/sales';

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

/**
 * Columnas por las que se puede ordenar el listado. El orden lo hace el
 * servidor: estas claves son las que acepta `GET /sales/customers/page`.
 */
export type CustomerSortKey =
  | 'code'
  | 'name'
  | 'documentType'
  | 'document'
  | 'phone'
  | 'email'
  | 'city'
  | 'status';
