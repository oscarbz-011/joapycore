import { invoiceTotalVariables } from './invoice-total-variables';

describe('invoiceTotalVariables', () => {
  it('prints what was paid in cash as the total to pay, without a rounding row', () => {
    expect(invoiceTotalVariables(15_483, 33)).toEqual({
      'factura.total': '15.450',
      'factura.totalEnLetras': 'QUINCE MIL CUATROCIENTOS CINCUENTA',
    });
  });

  it('prints the lines total when nothing was rounded', () => {
    expect(invoiceTotalVariables('220000', 0)).toMatchObject({
      'factura.total': '220.000',
    });
  });
});
