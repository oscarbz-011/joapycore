import { describe, expect, it } from 'vitest';
import { zeroChargeNotice } from './finance-zero-charge';

describe('zero-charge loan notice', () => {
  it('does not promise that the grace period is still active after it ended', () => {
    expect(
      zeroChargeNotice({
        graceDays: 5,
        hasMoraComponents: true,
        overdueDays: [7],
      }),
    ).toBe('Hay cuotas vencidas sin recargos pendientes en este momento.');
  });
});
