// Cálculo del precio de venta sugerido a partir del costo — compartido entre
// el modal de alta de producto (inventory/page.tsx) y el form de edición de la
// ficha (inventory/products/[id]/page.tsx). Vivía duplicado dentro del modal;
// se extrajo acá cuando la edición necesitó el mismo cálculo, para que la
// fórmula tenga una sola definición.

import type { MarkupType } from './api/inventory';
import { money } from './money';
import type { PricingConfig } from './api/settings';

// Los Decimal llegan de la API como texto: con `+` se concatenaban.
export function computeGlobalMarkupAmount(cost: number, cfg: PricingConfig): number {
  return (
    cfg.markupMethod === 'PERCENTAGE'
      ? money(cost).mul(cfg.defaultMarkup).div(100)
      : money(cfg.defaultMarkup)
  ).toNumber();
}

export function computeAdditionalAmount(basePrice: number, markup: number, type: MarkupType): number {
  return (type === 'PERCENTAGE' ? money(basePrice).mul(markup).div(100) : money(markup)).toNumber();
}

// El recargo adicional del producto se aplica SOBRE el precio ya marcado con
// el margen global, no sobre el costo — por eso `base` se calcula primero.
export function computeSuggestedPrice(
  cost: number, cfg: PricingConfig | null | undefined,
  additionalMarkup: number, additionalMarkupType: MarkupType | null,
): number {
  if (!cfg || money(cost).lte(0)) return 0;
  const base = money(cost).plus(computeGlobalMarkupAmount(cost, cfg));
  if (!additionalMarkup || !additionalMarkupType) return base.toNumber();
  return base
    .plus(computeAdditionalAmount(base.toNumber(), additionalMarkup, additionalMarkupType))
    .toNumber();
}
