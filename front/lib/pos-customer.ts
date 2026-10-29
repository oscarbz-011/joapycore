import type { CreateCustomerPayload, Customer, DocumentType, TaxpayerType } from './api/sales';
import { customerFullName, documentTypeLabel } from './customers';
import { rucProblem } from './ruc';

/** Cómo figura el comprador en la factura: nombre o razón social y documento. */
export function buyerSummary(customer: Customer): { name: string; document: string } {
  const label = documentTypeLabel(customer.documentType);
  return {
    name: customerFullName(customer),
    document: customer.documentNumber ? [label, customer.documentNumber].filter(Boolean).join(' ') : 'Sin documento',
  };
}

export interface QuickCustomerForm {
  taxpayerType: TaxpayerType;
  documentType: DocumentType;
  documentNumber: string;
  firstName: string;
  lastName: string;
}

export const EMPTY_QUICK_CUSTOMER: QuickCustomerForm = {
  taxpayerType: 'INDIVIDUAL',
  documentType: 'CI',
  documentNumber: '',
  firstName: '',
  lastName: '',
};

/** Una persona jurídica se identifica con su RUC. */
export function withTaxpayerType(form: QuickCustomerForm, taxpayerType: TaxpayerType): QuickCustomerForm {
  return {
    ...form,
    taxpayerType,
    documentType: taxpayerType === 'COMPANY' ? 'RUC' : form.documentType,
    lastName: taxpayerType === 'COMPANY' ? '' : form.lastName,
  };
}

export function quickCustomerProblem(form: QuickCustomerForm): string | null {
  const company = form.taxpayerType === 'COMPANY';
  if (!form.firstName.trim()) return company ? 'Escribí la razón social' : 'Escribí el nombre';
  if (!company && !form.lastName.trim()) return 'Escribí el apellido';
  if (!form.documentNumber.trim()) return 'Escribí el número de documento';
  if (form.documentType === 'RUC') return rucProblem(form.documentNumber);
  return null;
}

export function quickCustomerPayload(form: QuickCustomerForm): CreateCustomerPayload {
  const company = form.taxpayerType === 'COMPANY';
  return {
    taxpayerType: form.taxpayerType,
    documentType: company ? 'RUC' : form.documentType,
    documentNumber: form.documentNumber.trim(),
    firstName: form.firstName.trim(),
    lastName: company ? '' : form.lastName.trim(),
  };
}
