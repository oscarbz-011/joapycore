import { Prisma } from '@prisma/client';

// Montos y cantidades viajan como Decimal: en un test, Decimal('10') y 10 son
// el mismo valor. La comparación sigue siendo exacta (0.1 + 0.2 ≠ 0.3).
const toDecimal = (value: unknown): Prisma.Decimal | null => {
  if (Prisma.Decimal.isDecimal(value)) return value;
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  try {
    return new Prisma.Decimal(value);
  } catch {
    return null;
  }
};

function decimalEquals(a: unknown, b: unknown): boolean | undefined {
  if (!Prisma.Decimal.isDecimal(a) && !Prisma.Decimal.isDecimal(b)) {
    return undefined;
  }
  const left = toDecimal(a);
  const right = toDecimal(b);
  return left !== null && right !== null && left.eq(right);
}

// Jest lo tiene desde la 29.4, pero @types/jest todavía no lo declara.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    interface Expect {
      addEqualityTesters(
        testers: ((a: unknown, b: unknown) => boolean | undefined)[],
      ): void;
    }
  }
}

expect.addEqualityTesters([decimalEquals]);
