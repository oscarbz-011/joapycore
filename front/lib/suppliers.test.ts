import { describe, expect, it } from 'vitest';
import type { Supplier } from './api/procurement';
import {
  emptySupplierForm,
  filterSuppliers,
  paymentTermLabel,
  supplierFormFrom,
  supplierInitials,
  toSupplierPayload,
} from './suppliers';

function supplier(overrides: Partial<Supplier> = {}): Supplier {
  return {
    id: 's-1',
    name: 'Importadora Central',
    contactName: 'Ruth Cabrera',
    email: 'ruth@mail.com',
    phone: null,
    address: null,
    taxId: '80007145-1',
    isImporter: false,
    isActive: true,
    paymentTermDays: 0,
    ...overrides,
  };
}

describe('paymentTermLabel', () => {
  it('calls a zero or missing term cash payment', () => {
    expect(paymentTermLabel(0)).toBe('Contado');
    expect(paymentTermLabel(null)).toBe('Contado');
  });

  it('shows the days of a credit term', () => {
    expect(paymentTermLabel(30)).toBe('30 días');
    expect(paymentTermLabel(1)).toBe('1 día');
  });
});

describe('filterSuppliers', () => {
  const rows = [
    supplier(),
    supplier({
      id: 's-2',
      name: 'Distribuidora Ñandú',
      contactName: 'Román Benítez',
      email: 'roman@mail.com',
      taxId: '800012341-2',
    }),
  ];

  it('returns everything for an empty search', () => {
    expect(filterSuppliers(rows, '  ')).toHaveLength(2);
  });

  it('matches name, contact, email and RUC', () => {
    expect(filterSuppliers(rows, 'central').map((s) => s.id)).toEqual(['s-1']);
    expect(filterSuppliers(rows, 'roman@').map((s) => s.id)).toEqual(['s-2']);
    expect(filterSuppliers(rows, '80007145').map((s) => s.id)).toEqual(['s-1']);
  });

  it('ignores case and accents', () => {
    expect(filterSuppliers(rows, 'roman benitez').map((s) => s.id)).toEqual([
      's-2',
    ]);
    expect(filterSuppliers(rows, 'NANDU').map((s) => s.id)).toEqual(['s-2']);
  });
});

describe('supplier form', () => {
  it('starts empty, as a cash supplier', () => {
    expect(emptySupplierForm()).toEqual({
      name: '',
      contactName: '',
      email: '',
      phone: '',
      address: '',
      taxId: '',
      isImporter: false,
      paymentTermDays: '0',
    });
  });

  it('loads an existing supplier, turning missing values into blanks', () => {
    expect(
      supplierFormFrom(supplier({ paymentTermDays: null, isImporter: true })),
    ).toMatchObject({
      name: 'Importadora Central',
      phone: '',
      address: '',
      isImporter: true,
      paymentTermDays: '0',
    });
  });

  it('trims the values it sends', () => {
    const payload = toSupplierPayload({
      ...emptySupplierForm(),
      name: '  Importadora B  ',
      contactName: ' Roman ',
      paymentTermDays: '30',
    });

    expect(payload.name).toBe('Importadora B');
    expect(payload.contactName).toBe('Roman');
    expect(payload.paymentTermDays).toBe(30);
  });

  // El backend ignora un campo ausente al actualizar: para borrar un dato
  // opcional hay que mandarlo vacío, no omitirlo.
  it('sends cleared optional fields so an edit can remove them', () => {
    const payload = toSupplierPayload({
      ...supplierFormFrom(supplier()),
      email: '   ',
    });

    expect(payload).toHaveProperty('email');
    expect(payload.email).toBeNull();
  });

  it('treats a blank or invalid term as cash', () => {
    expect(
      toSupplierPayload({ ...emptySupplierForm(), paymentTermDays: '' })
        .paymentTermDays,
    ).toBe(0);
    expect(
      toSupplierPayload({ ...emptySupplierForm(), paymentTermDays: '-5' })
        .paymentTermDays,
    ).toBe(0);
  });
});

describe('supplierInitials', () => {
  it('takes the first letter of the first two words', () => {
    expect(supplierInitials('Importadora Central S.A.')).toBe('IC');
    expect(supplierInitials('  importadora   b ')).toBe('IB');
  });

  it('uses two letters of a single-word name', () => {
    expect(supplierInitials('Tokyo')).toBe('TO');
  });

  it('skips punctuation and survives an empty name', () => {
    expect(supplierInitials('"La Casa" del Cable')).toBe('LC');
    expect(supplierInitials('')).toBe('?');
  });
});
