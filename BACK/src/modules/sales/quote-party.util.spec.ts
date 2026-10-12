import { resolveOrderParty } from './quote-party.util';

describe('resolveOrderParty', () => {
  it('uses the registered customer when one is chosen', () => {
    expect(resolveOrderParty({ customerId: 'cus-1', isQuote: true })).toEqual({
      kind: 'customer',
      customerId: 'cus-1',
    });
    expect(resolveOrderParty({ customerId: 'cus-1', isQuote: false })).toEqual({
      kind: 'customer',
      customerId: 'cus-1',
    });
  });

  // Una persona o empresa que pide precio y todavía no es cliente.
  it('takes the data typed by hand for a quote', () => {
    expect(
      resolveOrderParty({
        isQuote: true,
        prospect: {
          name: '  Ferretería El Tornillo SRL ',
          document: ' 80012345-6 ',
          phone: '',
          email: undefined,
          address: 'Av. Mcal. López 1234',
        },
      }),
    ).toEqual({
      kind: 'prospect',
      fields: {
        prospectName: 'Ferretería El Tornillo SRL',
        prospectDocument: '80012345-6',
        prospectPhone: null,
        prospectEmail: null,
        prospectAddress: 'Av. Mcal. López 1234',
      },
    });
  });

  it('asks for a name', () => {
    expect(
      resolveOrderParty({ isQuote: true, prospect: { name: '   ' } }),
    ).toEqual({
      kind: 'invalid',
      reason: 'Ingresá el nombre o la razón social',
    });
  });

  // Un pedido real termina en factura: necesita un cliente registrado.
  it('refuses a real order for someone who is not a customer', () => {
    const party = resolveOrderParty({
      isQuote: false,
      prospect: { name: 'Juan Pérez' },
    });
    expect(party.kind).toBe('invalid');
  });

  it('refuses both a customer and typed data, and neither', () => {
    expect(
      resolveOrderParty({
        customerId: 'cus-1',
        prospect: { name: 'Juan Pérez' },
        isQuote: true,
      }).kind,
    ).toBe('invalid');
    expect(resolveOrderParty({ isQuote: true }).kind).toBe('invalid');
    expect(resolveOrderParty({ isQuote: false })).toEqual({
      kind: 'invalid',
      reason: 'Elegí un cliente',
    });
  });
});
