import { describe, expect, it } from "vitest";
import {
  orderAmounts,
  orderTotal,
} from "@/components/billing/credit-approval-shared";
import type { SaleOrder } from "@/lib/api/sales";

// La API manda los Decimal como texto: "15000" + 67500 se concatenaba y el
// total salía Gs. 7.762.517.250.
const order = {
  saleType: "CREDIT",
  interestRate: "15",
  surchargeType: "FIXED",
  surchargeAmount: "15000",
  loan: null,
  items: [{ quantity: 1, unitPrice: "67500", financedUnitPrice: "77625" }],
} as unknown as SaleOrder;

describe("credit approval amounts", () => {
  it("adds the financed surcharge to the financed items, from text values", () => {
    const amounts = orderAmounts(order);
    expect(amounts.subtotal.toString()).toBe("77625");
    expect(amounts.surcharge.toString()).toBe("17250");
    expect(orderTotal(order)).toBe(94875);
  });

  it("uses the loan total once the credit exists", () => {
    expect(
      orderTotal({ ...order, loan: { totalAmount: "94875" } } as unknown as SaleOrder),
    ).toBe(94875);
  });
});
