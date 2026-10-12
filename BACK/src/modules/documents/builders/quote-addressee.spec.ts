import { quoteAddressee } from './quote-addressee';

describe('quoteAddressee', () => {
  const customer = {
    firstName: 'Consumidor',
    lastName: 'Final',
    documentType: null,
    documentNumber: null,
    address: null,
  };

  it('addresses the quote to the data typed by hand', () => {
    expect(
      quoteAddressee({
        prospectName: 'Ferretería El Tornillo SRL',
        prospectDocument: '80012345-6',
        prospectAddress: null,
        customer,
      }),
    ).toEqual({
      name: 'Ferretería El Tornillo SRL',
      document: '80012345-6',
      address: '',
    });
  });

  it('addresses it to the registered customer otherwise', () => {
    expect(
      quoteAddressee({
        prospectName: null,
        customer: {
          firstName: 'Ruth',
          secondFirstName: 'María',
          lastName: 'Cabrera',
          secondLastName: null,
          documentType: 'RUC',
          documentNumber: '80007145-1',
          address: 'Asunción',
        },
      }),
    ).toEqual({
      name: 'Ruth María Cabrera',
      document: 'RUC: 80007145-1',
      address: 'Asunción',
    });
  });

  it('leaves a dash when there is no document', () => {
    expect(
      quoteAddressee({ prospectName: 'Juan Pérez', customer }).document,
    ).toBe('—');
    expect(quoteAddressee({ customer }).document).toBe('—');
  });
});
