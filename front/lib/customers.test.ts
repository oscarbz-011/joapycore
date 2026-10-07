import { describe, expect, it } from 'vitest';
import type { Customer } from './api/sales';
import {
  CUSTOMER_SORT,
  customerFullName,
  documentTypeLabel,
  filterCustomers,
} from './customers';
import { sortRows } from './table-sort';

function customer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 'c-1',
    customerCode: 'CLI-26-000006',
    firstName: 'Oscar',
    secondFirstName: null,
    lastName: 'Baez',
    secondLastName: null,
    documentType: 'CI',
    documentNumber: '5346377',
    email: 'oscar@mail.com',
    phone: '992123412',
    city: 'Encarnación',
    isActive: true,
    ...overrides,
  } as Customer;
}

const rows = [
  customer(),
  customer({
    id: 'c-2',
    customerCode: 'CLI-26-000004',
    firstName: 'Marcos',
    lastName: 'Ledezma',
    documentNumber: '4545452',
    email: 'marcos@mail.com',
    phone: '992111444',
    city: 'Asunción',
  }),
  // El cliente genérico de mostrador: sin código, documento ni contacto.
  customer({
    id: 'c-3',
    customerCode: null,
    firstName: 'Consumidor',
    lastName: 'Final',
    documentType: null,
    documentNumber: null,
    email: null,
    phone: null,
    city: null,
  }),
];

describe('customerFullName', () => {
  it('joins every name the customer has', () => {
    expect(
      customerFullName({
        firstName: 'María',
        secondFirstName: 'José',
        lastName: 'López',
        secondLastName: 'Giménez',
      }),
    ).toBe('María José López Giménez');
  });

  it('leaves no gaps where a name is missing', () => {
    expect(
      customerFullName({
        firstName: 'Oscar',
        secondFirstName: null,
        lastName: 'Baez',
        secondLastName: '',
      }),
    ).toBe('Oscar Baez');
  });
});

describe('documentTypeLabel', () => {
  it('names the document type as people read it', () => {
    expect(documentTypeLabel('CI')).toBe('C.I.');
    expect(documentTypeLabel('RUC')).toBe('RUC');
    expect(documentTypeLabel('PASSPORT')).toBe('Pasaporte');
    expect(documentTypeLabel(null)).toBeNull();
  });
});

describe('filterCustomers', () => {
  const ids = (search: string) => filterCustomers(rows, search).map((c) => c.id);

  it('returns everyone for an empty search', () => {
    expect(ids('  ')).toHaveLength(3);
  });

  it('matches name, document, code, email and phone', () => {
    expect(ids('ledezma')).toEqual(['c-2']);
    expect(ids('5346377')).toEqual(['c-1']);
    expect(ids('000004')).toEqual(['c-2']);
    expect(ids('oscar@')).toEqual(['c-1']);
    expect(ids('992111')).toEqual(['c-2']);
  });

  it('ignores case and accents', () => {
    expect(
      filterCustomers([customer({ firstName: 'María', lastName: 'Giménez' })], 'maria gimenez'),
    ).toHaveLength(1);
  });
});

describe('sorting customers', () => {
  const order = (key: keyof typeof CUSTOMER_SORT, direction: 'asc' | 'desc') =>
    sortRows(rows, { key, direction }, CUSTOMER_SORT).map((c) => c.id);

  // Como se busca a una persona en una lista: por apellido.
  it('sorts by last name', () => {
    expect(order('name', 'asc')).toEqual(['c-1', 'c-3', 'c-2']);
    expect(order('name', 'desc')).toEqual(['c-2', 'c-3', 'c-1']);
  });

  it('sorts by code and keeps customers without one at the end', () => {
    expect(order('code', 'asc')).toEqual(['c-2', 'c-1', 'c-3']);
    expect(order('code', 'desc')).toEqual(['c-1', 'c-2', 'c-3']);
  });

  it('sorts by city', () => {
    expect(order('city', 'asc')).toEqual(['c-2', 'c-1', 'c-3']);
  });
});
