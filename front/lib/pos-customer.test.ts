import { describe, expect, it } from 'vitest';
import type { Customer } from './api/sales';
import {
  EMPTY_QUICK_CUSTOMER,
  buyerSummary,
  quickCustomerPayload,
  quickCustomerProblem,
  withTaxpayerType,
} from './pos-customer';

const person = {
  firstName: 'María',
  secondFirstName: 'Isabel',
  lastName: 'González',
  secondLastName: null,
  documentType: 'CI',
  documentNumber: '1234567',
  taxpayerType: 'INDIVIDUAL',
} as Customer;

describe('buyerSummary', () => {
  it('shows the full name and identity document of a person', () => {
    expect(buyerSummary(person)).toEqual({ name: 'María Isabel González', document: 'C.I. 1234567' });
  });

  it('shows the legal name and RUC of a company', () => {
    const company = {
      ...person,
      firstName: 'TIPS S.A.',
      secondFirstName: null,
      lastName: '',
      documentType: 'RUC',
      documentNumber: '80069563-1',
      taxpayerType: 'COMPANY',
    } as Customer;
    expect(buyerSummary(company)).toEqual({ name: 'TIPS S.A.', document: 'RUC 80069563-1' });
  });
});

describe('quick customer', () => {
  it('requires a name, a last name and the document of a person', () => {
    expect(quickCustomerProblem(EMPTY_QUICK_CUSTOMER)).toBe('Escribí el nombre');
    expect(quickCustomerProblem({ ...EMPTY_QUICK_CUSTOMER, firstName: 'Ana' })).toBe('Escribí el apellido');
    expect(quickCustomerProblem({ ...EMPTY_QUICK_CUSTOMER, firstName: 'Ana', lastName: 'Gómez' })).toBe(
      'Escribí el número de documento',
    );
    expect(
      quickCustomerProblem({ ...EMPTY_QUICK_CUSTOMER, firstName: 'Ana', lastName: 'Gómez', documentNumber: '1234567' }),
    ).toBeNull();
  });

  it('identifies a company by its legal name and a valid RUC', () => {
    const company = withTaxpayerType({ ...EMPTY_QUICK_CUSTOMER, lastName: 'x' }, 'COMPANY');
    expect(company).toMatchObject({ documentType: 'RUC', lastName: '' });
    expect(quickCustomerProblem(company)).toBe('Escribí la razón social');
    expect(quickCustomerProblem({ ...company, firstName: 'TIPS S.A.', documentNumber: '80069563-2' })).toBe(
      'El dígito verificador del RUC no es correcto',
    );
    expect(quickCustomerProblem({ ...company, firstName: 'TIPS S.A.', documentNumber: '80069563-1' })).toBeNull();
  });

  it('sends the legal name in firstName and an empty last name for a company', () => {
    const form = { ...withTaxpayerType(EMPTY_QUICK_CUSTOMER, 'COMPANY'), firstName: ' TIPS S.A. ', documentNumber: '80069563-1 ' };
    expect(quickCustomerPayload(form)).toEqual({
      taxpayerType: 'COMPANY',
      documentType: 'RUC',
      documentNumber: '80069563-1',
      firstName: 'TIPS S.A.',
      lastName: '',
    });
  });
});
