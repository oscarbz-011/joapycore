import { describe, expect, it } from 'vitest';
import type { PricingConfig } from './api/settings';
import { computeSuggestedPrice } from './pricing';

const cfg = (markupMethod: string, defaultMarkup: unknown) =>
  ({ markupMethod, defaultMarkup }) as unknown as PricingConfig;

describe('computeSuggestedPrice', () => {
  // El margen llega de la API como texto: 1000 + "500" daba "1000500".
  it('adds a fixed markup that comes as text instead of concatenating it', () => {
    expect(computeSuggestedPrice(1000, cfg('FIXED', '500'), 0, null)).toBe(1500);
  });

  it('applies the percentage markup and then the product markup on top', () => {
    expect(computeSuggestedPrice(1000, cfg('PERCENTAGE', '30'), 10, 'PERCENTAGE')).toBe(1430);
    expect(computeSuggestedPrice(1000, cfg('PERCENTAGE', '30'), 70, 'FIXED')).toBe(1370);
  });

  it('suggests nothing without cost or configuration', () => {
    expect(computeSuggestedPrice(0, cfg('FIXED', '500'), 0, null)).toBe(0);
    expect(computeSuggestedPrice(1000, null, 0, null)).toBe(0);
  });
});
