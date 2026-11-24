import { money, roundGuaranies, splitInstallments, sumMoney } from './money';
import { chargedUnitPrice, saleAmounts } from './sale-amounts';

const asStrings = (values: { toString(): string }[]) =>
  values.map((v) => v.toString());

describe('money', () => {
  it('rounds to whole guaraníes without the float errors of Math.round', () => {
    expect(roundGuaranies('1277777.76615').toString()).toBe('1277778');
    expect(roundGuaranies('1.5').toString()).toBe('2');
    expect(roundGuaranies('-2.5').toString()).toBe('-3');
    expect(money('1.005').toDecimalPlaces(2, 4).toString()).toBe('1.01');
  });

  it('adds exactly', () => {
    expect(sumMoney(['0.1', '0.2']).toString()).toBe('0.3');
  });

  describe('splitInstallments', () => {
    it('puts the difference in the first installment, as in the SIFEN example', () => {
      expect(asStrings(splitInstallments(100000, 3))).toEqual([
        '33334',
        '33333',
        '33333',
      ]);
    });

    it('always adds up to the total', () => {
      for (const [total, count] of [
        [1000000, 3],
        [1277778, 7],
        [999, 12],
        [5, 6],
      ] as const) {
        const parts = splitInstallments(total, count);
        expect(parts).toHaveLength(count);
        expect(sumMoney(parts).toNumber()).toBe(total);
      }
    });

    it('refuses an amount that is not in whole guaraníes or an invalid count', () => {
      expect(() => splitInstallments('100.5', 2)).toThrow('guaraníes');
      expect(() => splitInstallments(100, 0)).toThrow('Cantidad de cuotas');
    });
  });
});

describe('saleAmounts', () => {
  it('prices a cash sale in whole guaraníes', () => {
    const result = saleAmounts({
      lines: [{ unitPrice: '15483.40', quantity: 2 }],
    });
    expect(result.lines[0].unitPrice.toString()).toBe('15483');
    expect(result.total.toString()).toBe('30966');
  });

  it('adds the interest per unit and keeps the lines adding up to the total', () => {
    const result = saleAmounts({
      lines: [
        { unitPrice: 1234567, quantity: 1 },
        { unitPrice: 99999, quantity: 3 },
      ],
      interestRate: '3.5',
    });
    expect(asStrings(result.lines.map((l) => l.unitPrice))).toEqual([
      '1277777',
      '103499',
    ]);
    expect(result.total.toString()).toBe(
      sumMoney(result.lines.map((l) => l.total)).toString(),
    );
  });

  it('charges a fixed surcharge with the interest of the credit', () => {
    const result = saleAmounts({
      lines: [{ unitPrice: 1000000, quantity: 1 }],
      surcharge: { type: 'FIXED', amount: 50000 },
      interestRate: 10,
    });
    expect(result.surcharge.toString()).toBe('55000');
    expect(result.total.toString()).toBe('1155000');
  });

  it('computes a percentage surcharge on the cash price of the items', () => {
    const result = saleAmounts({
      lines: [{ unitPrice: 333333, quantity: 1 }],
      surcharge: { type: 'PERCENTAGE', amount: 5 },
    });
    expect(result.surcharge.toString()).toBe('16667');
    expect(result.total.toString()).toBe('350000');
  });

  it('matches the unit price used on its own', () => {
    expect(chargedUnitPrice(99999, '3.5').toString()).toBe('103499');
    expect(chargedUnitPrice(1000, null).toString()).toBe('1000');
  });
});
