import { describe, expect, it } from "vitest";
import {
  amountToPay,
  cashRounding,
  chargedUnitPrice,
  roundGuaranies,
  saleAmounts,
  splitInstallments,
  sumMoney,
} from "./money";

const strings = (values: { toString(): string }[]) =>
  values.map((v) => v.toString());

describe("money", () => {
  it("rounds to whole guaraníes and adds without float errors", () => {
    expect(roundGuaranies("1277777.76615").toString()).toBe("1277778");
    expect(roundGuaranies("-2.5").toString()).toBe("-3");
    expect(sumMoney(["0.1", "0.2"]).toString()).toBe("0.3");
  });

  it("splits installments as the backend does: the difference in the first", () => {
    expect(strings(splitInstallments(100000, 3))).toEqual([
      "33334",
      "33333",
      "33333",
    ]);
    expect(sumMoney(splitInstallments(1000000, 3)).toString()).toBe("1000000");
    expect(splitInstallments(1000, 0)).toEqual([]);
  });

  // Mismos casos que BACK/src/common/money/money.spec.ts.
  it("computes the same sale amounts as the backend", () => {
    const credit = saleAmounts({
      lines: [
        { unitPrice: 1234567, quantity: 1 },
        { unitPrice: 99999, quantity: 3 },
      ],
      interestRate: "3.5",
    });
    expect(strings(credit.lines.map((l) => l.unitPrice))).toEqual([
      "1277777",
      "103499",
    ]);

    const withSurcharge = saleAmounts({
      lines: [{ unitPrice: 1000000, quantity: 1 }],
      surcharge: { type: "FIXED", amount: 50000 },
      interestRate: 10,
    });
    expect(withSurcharge.surcharge.toString()).toBe("55000");
    expect(withSurcharge.total.toString()).toBe("1155000");

    const percent = saleAmounts({
      lines: [{ unitPrice: 333333, quantity: 1 }],
      surcharge: { type: "PERCENTAGE", amount: 5 },
    });
    expect(percent.surcharge.toString()).toBe("16667");
    expect(percent.total.toString()).toBe("350000");
    expect(chargedUnitPrice(1000, null).toString()).toBe("1000");

    const percentWithInterest = saleAmounts({
      lines: [{ unitPrice: 33333, quantity: 1 }],
      surcharge: { type: "PERCENTAGE", amount: 7 },
      interestRate: 12,
    });
    expect(percentWithInterest.surcharge.toString()).toBe("2613");
    expect(percentWithInterest.total.toString()).toBe("39946");
  });
});

describe("cash rounding", () => {
  const cash = (amount: number) => ({ amount, method: "CASH" });
  const card = (amount: number) => ({ amount, method: "CARD" });

  it("rounds cash down to 50, as in the SIFEN manual", () => {
    expect(cashRounding(107_437, [cash(107_437)]).toNumber()).toBe(37);
    expect(amountToPay(47_789, [cash(50_000)]).toNumber()).toBe(47_750);
  });

  it("charges electronic payments exact and rounds only the cash part", () => {
    expect(cashRounding(15_483, [card(15_483)]).toNumber()).toBe(0);
    expect(cashRounding(15_483, [card(10_000), cash(0)]).toNumber()).toBe(33);
    expect(amountToPay(15_483, [card(10_020), cash(0)]).toNumber()).toBe(15_470);
  });
});
