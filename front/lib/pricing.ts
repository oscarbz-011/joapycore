// Cálculo del precio de venta sugerido a partir del costo — compartido entre
// el modal de alta de producto (inventory/page.tsx) y el form de edición de la
// ficha (inventory/products/[id]/page.tsx). Vivía duplicado dentro del modal;
// se extrajo acá cuando la edición necesitó el mismo cálculo, para que la
// fórmula tenga una sola definición.

import type { MarkupType } from './api/inventory';
import type { PricingConfig } from './api/settings';

export function computeGlobalMarkupAmount(cost: number, cfg: PricingConfig): number {
  return cfg.markupMethod === 'PERCENTAGE' ? cost * (cfg.defaultMarkup / 100) : cfg.defaultMarkup;
}

export function computeAdditionalAmount(basePrice: number, markup: number, type: MarkupType): number {
  return type === 'PERCENTAGE' ? basePrice * (markup / 100) : markup;
}

// El recargo adicional del producto se aplica SOBRE el precio ya marcado con
// el margen global, no sobre el costo — por eso `base` se calcula primero.
export function computeSuggestedPrice(
  cost: number, cfg: PricingConfig | null | undefined,
  additionalMarkup: number, additionalMarkupType: MarkupType | null,
): number {
  if (!cfg || cost <= 0) return 0;
  const base = cfg.markupMethod === 'PERCENTAGE' ? cost * (1 + cfg.defaultMarkup / 100) : cost + cfg.defaultMarkup;
  if (!additionalMarkup || !additionalMarkupType) return base;
  return additionalMarkupType === 'PERCENTAGE' ? base * (1 + additionalMarkup / 100) : base + additionalMarkup;
}
