import type { QuantityValue } from '../../../common/units/quantity';
import { unitSymbol } from '../../../common/units/units-of-measure';
import { money, sumMoney, type MoneyValue } from '../../../common/money/money';
import { numberToWordsEs } from '../../../common/utils/number-to-words.util';
import type { PdfTableVariable } from '../../../files/pdf/tiptap-to-html.converter';

/** Lo que el PDF de la orden de compra necesita de la base. */
export interface PurchaseOrderForPdf {
  id: string;
  orderNumber: string | null;
  orderDate: Date;
  notes: string | null;
  /** Condición de pago pactada en la orden, en días (0 = contado). */
  paymentTermDays: number;
  tenant: {
    name: string;
    razonSocial: string | null;
    ruc: string | null;
    address: string | null;
    city: string | null;
    phone: string | null;
    email: string | null;
  };
  branch: { name: string; address: string | null; city: string | null } | null;
  supplier: {
    name: string;
    taxId: string | null;
    address: string | null;
    contactName: string | null;
    phone: string | null;
    email: string | null;
  };
  items: {
    quantity: QuantityValue;
    unitCost: unknown;
    supplierSku: string | null;
    supplierDescription: string | null;
    product: { name: string; unitCode: number };
  }[];
}

const formatMoney = (value: MoneyValue) =>
  money(value).toNumber().toLocaleString('es-PY', { maximumFractionDigits: 0 });

// orderDate y expectedDate son días de calendario (medianoche UTC del día
// elegido): se imprimen en UTC para no correrlos un día.
const formatDay = (value: Date) =>
  value.toLocaleDateString('es-PY', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  });

const joinPlace = (...parts: (string | null)[]) =>
  parts.filter(Boolean).join(', ');

/**
 * Variables de la plantilla de orden de compra. Función pura: el listener
 * que genera el PDF solo agrega el logo y elige la plantilla.
 */
export function buildPurchaseOrderVariables(order: PurchaseOrderForPdf): {
  variables: Record<string, string>;
  tableVariables: Record<string, PdfTableVariable>;
} {
  const { tenant, supplier, branch } = order;

  const rows = order.items.map((item) => {
    const unitCost = money(item.unitCost as MoneyValue);
    return [
      item.supplierSku ?? '—',
      item.supplierDescription ?? item.product.name,
      String(item.quantity),
      unitSymbol(item.product.unitCode),
      `Gs. ${formatMoney(unitCost)}`,
      `Gs. ${formatMoney(money(unitCost).mul(item.quantity))}`,
    ];
  });
  const total = sumMoney(
    order.items.map((item) =>
      money(item.unitCost as MoneyValue).mul(item.quantity),
    ),
  );

  const tenantPlace = joinPlace(tenant.address, tenant.city);
  const deliveryPlace = branch
    ? [branch.name, joinPlace(branch.address, branch.city)]
        .filter(Boolean)
        .join(' — ')
    : tenantPlace;

  return {
    variables: {
      'tenant.razonSocial': tenant.razonSocial ?? tenant.name,
      'tenant.ruc': tenant.ruc ?? '',
      'tenant.direccion': tenant.address ?? '',
      'tenant.ciudad': tenant.city ?? '',
      'tenant.telefono': tenant.phone ?? '',
      'tenant.email': tenant.email ?? '',
      'proveedor.nombre': supplier.name,
      'proveedor.ruc': supplier.taxId ?? '',
      'proveedor.direccion': supplier.address ?? '',
      'proveedor.contacto': supplier.contactName ?? '',
      'proveedor.telefono': supplier.phone ?? '',
      'proveedor.email': supplier.email ?? '',
      'orden.numero': order.orderNumber ?? '—',
      'orden.fecha': formatDay(order.orderDate),
      'orden.lugarEntrega': deliveryPlace,
      'orden.condicionPago': order.paymentTermDays
        ? `Crédito a ${order.paymentTermDays} días`
        : 'Contado',
      'orden.notas': order.notes ?? '',
      'orden.total': formatMoney(total),
      'orden.totalEnLetras': numberToWordsEs(total.toNumber()),
    },
    tableVariables: {
      'orden.items': {
        headers: [
          'Código',
          'Descripción',
          'Cant.',
          'Unidad',
          'Costo unit.',
          'Subtotal',
        ],
        rows,
      },
    },
  };
}
