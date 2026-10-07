import { UnprocessableEntityException } from '@nestjs/common';

/** Descuento sobre el total de la orden, desde cierto monto. */
export interface VolumeDiscount {
  minAmount: number;
  percent: number;
}

/** Precio de un ítem del catálogo desde cierta cantidad. */
export interface PriceTier {
  minQuantity: number;
  price: number;
}

// Cada proveedor arma sus descuentos a su manera, pero en todos comprar más
// nunca sale más caro. Se guardan ordenados para que quien los lee (el
// comparador) solo tenga que buscar el último tramo que aplica.

export function normalizeVolumeDiscounts(
  discounts: VolumeDiscount[] | undefined | null,
): VolumeDiscount[] {
  const sorted = [...(discounts ?? [])]
    .map(({ minAmount, percent }) => ({ minAmount, percent }))
    .sort((a, b) => a.minAmount - b.minAmount);

  sorted.forEach((tier, index) => {
    const previous = sorted[index - 1];
    if (!previous) return;
    if (tier.minAmount === previous.minAmount) {
      throw new UnprocessableEntityException(
        'Hay dos descuentos por volumen que empiezan en el mismo monto',
      );
    }
    if (tier.percent < previous.percent) {
      throw new UnprocessableEntityException(
        'Un descuento por volumen no puede ser menor que el del tramo anterior',
      );
    }
  });
  return sorted;
}

export function normalizePriceTiers(
  tiers: PriceTier[] | undefined | null,
  listPrice?: number | null,
): PriceTier[] {
  const sorted = [...(tiers ?? [])]
    .map(({ minQuantity, price }) => ({ minQuantity, price }))
    .sort((a, b) => a.minQuantity - b.minQuantity);

  sorted.forEach((tier, index) => {
    const previous = sorted[index - 1];
    if (previous && tier.minQuantity === previous.minQuantity) {
      throw new UnprocessableEntityException(
        'Hay dos precios por cantidad para la misma cantidad',
      );
    }
    const ceiling = previous?.price ?? listPrice;
    if (ceiling != null && tier.price > ceiling) {
      throw new UnprocessableEntityException(
        'El precio por cantidad no puede ser mayor que el del tramo anterior',
      );
    }
  });
  return sorted;
}

/** Descuento sobre el total de la orden, desde cierta cantidad de unidades. */
export interface QuantityDiscount {
  minQuantity: number;
  percent: number;
}

export function normalizeQuantityDiscounts(
  discounts: QuantityDiscount[] | undefined | null,
): QuantityDiscount[] {
  const sorted = [...(discounts ?? [])]
    .map(({ minQuantity, percent }) => ({ minQuantity, percent }))
    .sort((a, b) => a.minQuantity - b.minQuantity);

  sorted.forEach((tier, index) => {
    const previous = sorted[index - 1];
    if (!previous) return;
    if (tier.minQuantity === previous.minQuantity) {
      throw new UnprocessableEntityException(
        'Hay dos descuentos por cantidad que empiezan en la misma cantidad',
      );
    }
    if (tier.percent < previous.percent) {
      throw new UnprocessableEntityException(
        'Un descuento por cantidad no puede ser menor que el del tramo anterior',
      );
    }
  });
  return sorted;
}
