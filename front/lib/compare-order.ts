import type { CreateProductPayload } from './api/inventory';
import type { CreatePurchaseOrderPayload } from './api/procurement';
import type { SupplierQuote } from './supplier-comparison';

// De la comparación a la orden de compra. Recién acá hace falta que cada ítem
// tenga un producto: hasta decidir a quién comprarle se compara sin crearlos.

export interface PlanLine {
  rowKey: string;
  itemId: string;
  description: string;
  supplierSku: string;
  /** En unidades internas: lo que entra al stock. */
  quantity: number;
  unitCost: number;
  /** null = todavía no hay producto: se crea al confirmar la orden. */
  productId: string | null;
}

export interface NewProduct {
  rowKey: string;
  /** Ítem del proveedor elegido, del que nace el producto. */
  itemId: string;
  name: string;
  costPrice: number;
  /** Ítems equivalentes de otros proveedores, que se vinculan al mismo producto. */
  siblingItemIds: string[];
}

export interface OrderPlan {
  lines: PlanLine[];
  newProducts: NewProduct[];
  /** Ítems del proveedor elegido que se vinculan a un producto que ya existe. */
  links: { itemId: string; productId: string }[];
}

export function orderPlan(
  chosen: SupplierQuote,
  quotes: readonly SupplierQuote[],
): OrderPlan {
  const plan: OrderPlan = { lines: [], newProducts: [], links: [] };

  for (const line of chosen.lines) {
    // Lo que los otros proveedores eligieron para la misma fila.
    const siblings = quotes
      .filter((quote) => quote.supplier.id !== chosen.supplier.id)
      .flatMap((quote) => quote.lines)
      .filter((other) => other.productId === line.productId);

    // Si otro proveedor ya lo tiene vinculado, el producto existe.
    const existing =
      line.linkedProductId ??
      siblings.find((other) => other.linkedProductId)?.linkedProductId ??
      null;

    if (existing && !line.linkedProductId) {
      plan.links.push({ itemId: line.itemId, productId: existing });
    }
    if (!existing) {
      plan.newProducts.push({
        rowKey: line.productId,
        itemId: line.itemId,
        name: line.description,
        costPrice: line.unitCost,
        siblingItemIds: siblings
          .filter((other) => !other.linkedProductId)
          .map((other) => other.itemId),
      });
    }

    plan.lines.push({
      rowKey: line.productId,
      itemId: line.itemId,
      description: line.description,
      supplierSku: line.supplierSku,
      quantity: line.unitsReceived,
      unitCost: line.unitCost,
      productId: existing,
    });
  }
  return plan;
}

/** Lo que se pide de un producto nuevo al armar la orden. */
export interface NewProductForm {
  name: string;
  categoryId: string;
  salePrice: number;
}

/** Sin categoría o sin precio de venta la ficha queda en borrador. */
export function staysDraft(form: NewProductForm): boolean {
  return !form.categoryId || !(form.salePrice > 0);
}

export function newProductPayload(
  product: NewProduct,
  form: NewProductForm,
): CreateProductPayload {
  return {
    name: form.name.trim() || product.name,
    ...(form.categoryId && { categoryId: form.categoryId }),
    costPrice: product.costPrice,
    ...(form.salePrice > 0 && { salePrice: form.salePrice }),
    isSerialized: false,
    isPurchasable: true,
    // Se puede comprar ya; a la venta sale con la primera recepción.
    sellOnFirstReceipt: true,
  };
}

export function orderPayload(
  supplierId: string,
  orderDate: string,
  lines: readonly {
    itemId: string;
    productId: string;
    quantity: number;
    unitCost: number;
  }[],
): CreatePurchaseOrderPayload {
  // Dos filas pueden haber terminado en el mismo producto, y la orden no
  // admite un producto repetido: se suman en una sola línea.
  const items: CreatePurchaseOrderPayload['items'] = [];
  for (const line of lines) {
    const same = items.find((item) => item.productId === line.productId);
    if (same) same.quantity += Math.round(line.quantity);
    else {
      items.push({
        productId: line.productId,
        quantity: Math.round(line.quantity),
        unitCost: line.unitCost,
        catalogItemId: line.itemId,
      });
    }
  }
  return { supplierId, purchaseType: 'LOCAL', orderDate, items };
}
