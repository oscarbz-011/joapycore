import { qty } from '../../common/units/quantity';
import type { QuantityValue } from '../../common/units/quantity';
import { UnprocessableEntityException } from '@nestjs/common';
import { money, type MoneyValue } from '../../common/money/money';

/** Descuento sobre el total de la orden, desde cierto monto. */
export interface VolumeDiscount {
  minAmount: number;
  percent: number;
}

/** Precio de un ítem del catálogo desde cierta cantidad. */
export interface PriceTier {
  minQuantity: QuantityValue;
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
    .sort((a, b) => money(a.minAmount).cmp(b.minAmount));

  sorted.forEach((tier, index) => {
    const previous = sorted[index - 1];
    if (!previous) return;
    if (money(tier.minAmount).eq(previous.minAmount)) {
      throw new UnprocessableEntityException(
        'Hay dos descuentos por volumen que empiezan en el mismo monto',
      );
    }
    if (money(tier.percent).lt(previous.percent)) {
      throw new UnprocessableEntityException(
        'Un descuento por volumen no puede ser menor que el del tramo anterior',
      );
    }
  });
  return sorted;
}

export function normalizePriceTiers(
  tiers: PriceTier[] | undefined | null,
  listPrice?: MoneyValue | null,
): PriceTier[] {
  const sorted = [...(tiers ?? [])]
    .map(({ minQuantity, price }) => ({ minQuantity, price }))
    .sort((a, b) => qty(a.minQuantity).cmp(b.minQuantity));

  sorted.forEach((tier, index) => {
    const previous = sorted[index - 1];
    if (previous && qty(tier.minQuantity).eq(previous.minQuantity)) {
      throw new UnprocessableEntityException(
        'Hay dos precios por cantidad para la misma cantidad',
      );
    }
    const ceiling = previous?.price ?? listPrice;
    if (ceiling != null && money(tier.price).gt(ceiling)) {
      throw new UnprocessableEntityException(
        'El precio por cantidad no puede ser mayor que el del tramo anterior',
      );
    }
  });
  return sorted;
}

/** Descuento sobre el total de la orden, desde cierta cantidad de unidades. */
export interface QuantityDiscount {
  minQuantity: QuantityValue;
  percent: number;
}

export function normalizeQuantityDiscounts(
  discounts: QuantityDiscount[] | undefined | null,
): QuantityDiscount[] {
  const sorted = [...(discounts ?? [])]
    .map(({ minQuantity, percent }) => ({ minQuantity, percent }))
    .sort((a, b) => qty(a.minQuantity).cmp(b.minQuantity));

  sorted.forEach((tier, index) => {
    const previous = sorted[index - 1];
    if (!previous) return;
    if (qty(tier.minQuantity).eq(previous.minQuantity)) {
      throw new UnprocessableEntityException(
        'Hay dos descuentos por cantidad que empiezan en la misma cantidad',
      );
    }
    if (money(tier.percent).lt(previous.percent)) {
      throw new UnprocessableEntityException(
        'Un descuento por cantidad no puede ser menor que el del tramo anterior',
      );
    }
  });
  return sorted;
}
