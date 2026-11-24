import { describe, expect, it } from "vitest";
import { installmentPlan } from "@/lib/money";
import { formatPrice, installmentsText } from "@/components/sales/order-line-items";

describe("installmentsText", () => {
  it("shows the first installment apart when it carries the difference", () => {
    const plan = installmentPlan(100000, 3);
    expect(plan && installmentsText(plan)).toBe(
      `1 cuota de ${formatPrice(33334)} y 2 de ${formatPrice(33333)}`,
    );
  });

  it("shows a single amount when every installment is the same", () => {
    const plan = installmentPlan(90000, 3);
    expect(plan && installmentsText(plan)).toBe(`3 cuotas de ${formatPrice(30000)}`);
    const one = installmentPlan(5000, 1);
    expect(one && installmentsText(one)).toBe(`1 cuota de ${formatPrice(5000)}`);
  });
});
