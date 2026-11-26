import { UnprocessableEntityException } from '@nestjs/common';
import type { ProductPresentation } from '@prisma/client';
import { factorFromDimensions } from '../../common/units/dimensions';
import {
  assertQuantityForUnit,
  qty,
  type Quantity,
  type QuantityValue,
} from '../../common/units/quantity';
import { DEFAULT_UNIT_CODE } from '../../common/units/units-of-measure';

export interface SaleLineCut {
  length?: number | null;
  width?: number | null;
  height?: number | null;
}

export interface SaleLineUnitInput {
  quantity: QuantityValue;
  presentationId?: string | null;
  cut?: SaleLineCut | null;
}

export interface SaleLineProduct {
  id: string;
  name: string;
  unitCode: number;
  isSerialized: boolean;
}

/** Cómo quedó vendida la línea, listo para guardar en SaleOrderItem. */
export interface SaleLineUnit {
  presentationId: string | null;
  presentationName: string | null;
  unitCode: number | null;
  unitFactor: Quantity;
  cutLength: Quantity | null;
  cutWidth: Quantity | null;
  cutHeight: Quantity | null;
  /** Lo que mueve el stock, en la unidad del producto. */
  baseQuantity: Quantity;
}

const fail = (message: string) => new UnprocessableEntityException(message);
const nullable = (value: number | null | undefined) =>
  value == null ? null : qty(value);

/**
 * Resuelve en qué se vende una línea: en la unidad del producto, en una de
 * sus presentaciones o como corte a medida. El factor sale siempre de lo
 * guardado (presentación) o de las medidas, nunca del cliente.
 */
export function resolveSaleUnit(
  line: SaleLineUnitInput,
  product: SaleLineProduct | null,
  presentations: ReadonlyMap<string, ProductPresentation>,
): SaleLineUnit {
  const plain = (factor: Quantity): SaleLineUnit => ({
    presentationId: null,
    presentationName: null,
    unitCode: null,
    unitFactor: factor,
    cutLength: null,
    cutWidth: null,
    cutHeight: null,
    baseQuantity: qty(line.quantity).mul(factor),
  });

  if (!product) {
    if (line.presentationId || line.cut) {
      throw fail('Una línea sin producto no lleva presentación ni medidas');
    }
    return plain(qty(1));
  }
  if (line.presentationId && line.cut) {
    throw fail(
      `"${product.name}": elegí una presentación o un corte a medida, no los dos`,
    );
  }
  if ((line.presentationId || line.cut) && product.isSerialized) {
    throw fail(`"${product.name}" tiene número de serie: se vende por unidad`);
  }

  if (line.presentationId) {
    const presentation = presentations.get(line.presentationId);
    if (!presentation || presentation.productId !== product.id) {
      throw fail(`La presentación elegida no es de "${product.name}"`);
    }
    if (!presentation.isActive) {
      throw fail(
        `La presentación "${presentation.name}" de "${product.name}" está desactivada`,
      );
    }
    assertQuantityForUnit(line.quantity, {
      name: `${product.name} (${presentation.name})`,
      unitCode: presentation.unitCode,
    });
    return {
      ...plain(presentation.factor),
      presentationId: presentation.id,
      presentationName: presentation.name,
      unitCode: presentation.unitCode,
    };
  }

  if (line.cut) {
    const factor = factorFromDimensions(product.unitCode, line.cut);
    assertQuantityForUnit(line.quantity, {
      name: `${product.name} (corte)`,
      unitCode: DEFAULT_UNIT_CODE,
    });
    return {
      ...plain(factor),
      unitCode: DEFAULT_UNIT_CODE,
      cutLength: nullable(line.cut.length),
      cutWidth: nullable(line.cut.width),
      cutHeight: nullable(line.cut.height),
    };
  }

  assertQuantityForUnit(line.quantity, product);
  return plain(qty(1));
}
