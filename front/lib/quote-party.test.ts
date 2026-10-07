import { describe, expect, it } from 'vitest';
import {
  customerPrefillFrom,
  emptyProspect,
  isProspectOrder,
  keepFirstRead,
  orderPartyDocument,
  orderPartyName,
  prospectError,
  toProspectPayload,
  type OrderPartySource,
} from './quote-party';

const registered: OrderPartySource = {
  prospectName: null,
  customer: {
    firstName: 'Ruth',
    lastName: 'Cabrera',
    documentType: 'RUC',
    documentNumber: '80007145-1',
  },
};

// Presupuesto para alguien sin registrar: cuelga del cliente genérico.
const prospect: OrderPartySource = {
  prospectName: 'Ferretería El Tornillo SRL',
  prospectDocument: '80012345-6',
  prospectPhone: '0981 123 456',
  prospectEmail: null,
  prospectAddress: 'Av. Mcal. López 1234',
  customer: { firstName: 'Consumidor', lastName: 'Final' },
};

describe('data typed by hand', () => {
  it('only needs a name', () => {
    expect(prospectError({ ...emptyProspect(), name: 'Juan Pérez' })).toBeNull();
    expect(prospectError(emptyProspect())).toMatch(/nombre o la razón social/);
    expect(prospectError({ ...emptyProspect(), name: '   ' })).toMatch(/nombre/);
  });

  it('checks the email only when one is typed', () => {
    const form = { ...emptyProspect(), name: 'Juan Pérez' };
    expect(prospectError({ ...form, email: 'juan@mail.com' })).toBeNull();
    expect(prospectError({ ...form, email: 'juan@' })).toMatch(/email/);
  });

  it('sends what was filled in and leaves the rest out', () => {
    expect(
      toProspectPayload({
        name: '  Ferretería El Tornillo SRL ',
        document: ' 80012345-6 ',
        phone: '',
        email: '  ',
        address: 'Av. Mcal. López 1234',
      }),
    ).toEqual({
      name: 'Ferretería El Tornillo SRL',
      document: '80012345-6',
      phone: undefined,
      email: undefined,
      address: 'Av. Mcal. López 1234',
    });
  });
});

describe('who a quote is for', () => {
  // Nunca "Consumidor Final": ese es solo el cliente del que cuelga.
  it('shows the typed name, not the placeholder customer', () => {
    expect(isProspectOrder(prospect)).toBe(true);
    expect(orderPartyName(prospect)).toBe('Ferretería El Tornillo SRL');
    expect(orderPartyDocument(prospect)).toBe('80012345-6');
  });

  it('shows the registered customer otherwise', () => {
    expect(isProspectOrder(registered)).toBe(false);
    expect(orderPartyName(registered)).toBe('Ruth Cabrera');
    expect(orderPartyDocument(registered)).toBe('RUC: 80007145-1');
  });

  it('has no document line when none was given', () => {
    expect(orderPartyDocument({ ...prospect, prospectDocument: null })).toBeNull();
    expect(
      orderPartyDocument({
        prospectName: null,
        customer: { firstName: 'Ana', lastName: 'Gómez' },
      }),
    ).toBeNull();
  });
});

describe('registering the prospect as a customer', () => {
  it('starts the customer record from what the quote already has', () => {
    expect(customerPrefillFrom(prospect)).toEqual({
      firstName: 'Ferretería',
      lastName: 'El Tornillo SRL',
      documentNumber: '80012345-6',
      phone: '0981 123 456',
      email: undefined,
      address: 'Av. Mcal. López 1234',
    });
  });

  it('keeps a single-word name as the first name', () => {
    expect(
      customerPrefillFrom({ ...prospect, prospectName: 'Coopeduc' }),
    ).toMatchObject({ firstName: 'Coopeduc', lastName: '' });
  });
});

// El alta de cliente lee los datos del presupuesto y borra la clave. En
// desarrollo la pantalla se monta dos veces y la segunda lectura llega vacía.
describe('keepFirstRead', () => {
  const prefill = { firstName: 'ANTONIO', lastName: 'BRITEZ' };

  it('takes what the first read brings', () => {
    expect(keepFirstRead(undefined, prefill)).toBe(prefill);
  });

  it('is not wiped by a second, empty read', () => {
    expect(keepFirstRead(prefill, null)).toBe(prefill);
  });

  it('settles on nothing when there was nothing to read', () => {
    expect(keepFirstRead(undefined, null)).toBeNull();
    expect(keepFirstRead(null, null)).toBeNull();
  });
});
