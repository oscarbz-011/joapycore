import { UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  assertPaymentsCover,
  cashRounding,
  issueRounding,
} from './cash-rounding';

const dec = (v: string | number) => new Prisma.Decimal(v);
const cash = (amount: number) => ({ amount, paymentMethod: 'CASH' as const });
const card = (amount: number) => ({ amount, paymentMethod: 'CARD' as const });

describe('cashRounding', () => {
  it('rounds what is paid in cash down to a multiple of 50, as in the SIFEN manual', () => {
    expect(cashRounding(107_437, [cash(107_437)])).toEqual(dec(37));
    expect(cashRounding(47_789, [cash(50_000)])).toEqual(dec(39));
    expect(cashRounding(15_450, [cash(15_450)])).toEqual(dec(0));
  });

  it('charges electronic payments exact', () => {
    expect(cashRounding(15_483, [card(15_483)])).toEqual(dec(0));
    expect(
      cashRounding(15_483, [
        { amount: 15_483, paymentMethod: 'BANK_TRANSFER' },
      ]),
    ).toEqual(dec(0));
  });

  it('rounds only the cash part of a mixed payment', () => {
    expect(cashRounding(15_483, [card(10_000), cash(5_450)])).toEqual(dec(33));
    expect(cashRounding(15_483, [card(10_020), cash(5_500)])).toEqual(dec(13));
  });

  it('leaves nothing to round when the card covers the total', () => {
    expect(cashRounding(15_483, [card(15_483), cash(0)])).toEqual(dec(0));
  });
});

describe('assertPaymentsCover', () => {
  it('accepts the rounded cash total and change in cash', () => {
    expect(assertPaymentsCover(15_483, [cash(15_450)])).toEqual(dec(33));
    expect(assertPaymentsCover(15_483, [cash(20_000)])).toEqual(dec(33));
    expect(assertPaymentsCover(15_483, [card(10_000), cash(5_450)])).toEqual(
      dec(33),
    );
  });

  it('asks for what is missing', () => {
    expect(() => assertPaymentsCover(15_483, [cash(15_400)])).toThrow(
      'Faltan Gs. 50 por cobrar: el total a pagar es Gs. 15.450',
    );
    expect(() => assertPaymentsCover(15_483, [card(15_000)])).toThrow(
      UnprocessableEntityException,
    );
  });

  it('does not take more than the total with card or transfer', () => {
    expect(() => assertPaymentsCover(15_483, [card(16_000)])).toThrow(
      'Con tarjeta, transferencia o cheque no se puede cobrar más que el total (Gs. 15.483)',
    );
  });
});

describe('issueRounding', () => {
  const base = { total: 15_483, current: 0 };

  it('rounds a cash invoice paid in cash', () => {
    expect(
      issueRounding({
        ...base,
        paymentCondition: 'CASH',
        paymentMethod: 'CASH',
      }),
    ).toEqual(dec(33));
  });

  it('charges exact with an electronic method or on credit', () => {
    expect(
      issueRounding({
        ...base,
        paymentCondition: 'CASH',
        paymentMethod: 'CARD',
      }),
    ).toEqual(dec(0));
    expect(
      issueRounding({
        ...base,
        current: 33,
        paymentCondition: 'CREDIT',
        paymentMethod: 'CASH',
      }),
    ).toEqual(dec(0));
  });

  it('keeps what the sale payments gave when no method is chosen', () => {
    expect(
      issueRounding({ ...base, current: 13, paymentCondition: 'CASH' }),
    ).toEqual(dec(13));
  });
});
