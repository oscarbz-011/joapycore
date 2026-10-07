import type { CreateProductPayload } from './api/inventory';
import type { SupplierCatalogItem } from './api/procurement';
import type { PricingConfig } from './api/settings';
import { computeSuggestedPrice } from './pricing';

/** Datos que se piden para crear un producto desde un ítem del catálogo. */
export interface CatalogProductForm {
  name: string;
  categoryId: string;
  brandId: string;
  unit: string;
  costPrice: number;
  salePrice: number;
  isSerialized: boolean;
}

/**
 * Costo por unidad interna: el proveedor puede vender por bulto ("caja x12")
 * y el factor de conversión dice cuántas unidades trae.
 */
export function catalogUnitCost(item: SupplierCatalogItem): number {
  if (item.price === null) return 0;
  const factor =
    item.conversionFactor && item.conversionFactor > 0
      ? item.conversionFactor
      : 1;
  return Math.round((item.price / factor) * 100) / 100;
}

export function catalogProductFormFrom(
  item: SupplierCatalogItem,
): CatalogProductForm {
  return {
    name: item.description,
    categoryId: '',
    brandId: '',
    unit: 'unidad',
    costPrice: catalogUnitCost(item),
    salePrice: 0,
    isSerialized: false,
  };
}

/**
 * Precio de venta sugerido para ese costo con el margen global de la empresa,
 * el mismo cálculo del alta de productos de Inventario. 0 = sin sugerencia.
 */
export function suggestedSalePrice(
  costPrice: number,
  pricing: PricingConfig | null | undefined,
): number {
  return Math.round(computeSuggestedPrice(costPrice, pricing, 0, null));
}

/** Margen global tal como se muestra junto al precio sugerido. */
export function markupLabel(pricing: PricingConfig): string {
  const amount = new Intl.NumberFormat('es-PY').format(pricing.defaultMarkup);
  return pricing.markupMethod === 'PERCENTAGE' ? `${amount}%` : `Gs. ${amount}`;
}

/** Qué falta para poder crear el producto activo, o null si está completo. */
export function catalogProductError(form: CatalogProductForm): string | null {
  if (!form.name.trim()) return 'Falta el nombre del producto';
  if (!form.categoryId) return 'Elegí una categoría';
  if (!(form.costPrice > 0)) return 'Falta el precio de costo';
  if (!(form.salePrice > 0)) return 'Falta el precio de venta';
  return null;
}

// sellOnFirstReceipt: el producto se puede comprar enseguida, pero no se
// ofrece a la venta hasta recibir la primera mercadería.
export function toCatalogProductPayload(
  form: CatalogProductForm,
): CreateProductPayload {
  return {
    name: form.name.trim(),
    categoryId: form.categoryId,
    ...(form.brandId && { brandId: form.brandId }),
    unit: form.unit.trim() || 'unidad',
    costPrice: form.costPrice,
    salePrice: form.salePrice,
    isSerialized: form.isSerialized,
    isPurchasable: true,
    sellOnFirstReceipt: true,
  };
}
