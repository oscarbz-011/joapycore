import { numberToWordsEs } from '../../../common/utils/number-to-words.util';
import type { PdfTableVariable } from '../../../files/pdf/tiptap-to-html.converter';

/** Lo que el PDF de la orden de compra necesita de la base. */
export interface PurchaseOrderForPdf {
  id: string;
  orderNumber: string | null;
  orderDate: Date;
  expectedDate: Date | null;
  notes: string | null;
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
    paymentTermDays: number | null;
  };
  items: {
    quantity: number;
    unitCost: unknown;
    supplierSku: string | null;
    supplierDescription: string | null;
    product: { name: string; unit: string };
  }[];
}

const formatMoney = (value: number) =>
  value.toLocaleString('es-PY', { maximumFractionDigits: 0 });

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
    const unitCost = Number(item.unitCost);
    return [
      item.supplierSku ?? '—',
      item.supplierDescription ?? item.product.name,
      String(item.quantity),
      item.product.unit,
      `Gs. ${formatMoney(unitCost)}`,
      `Gs. ${formatMoney(unitCost * item.quantity)}`,
    ];
  });
  const total = order.items.reduce(
    (sum, item) => sum + Number(item.unitCost) * item.quantity,
    0,
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
      'orden.entregaEstimada': order.expectedDate
        ? formatDay(order.expectedDate)
        : 'A convenir',
      'orden.lugarEntrega': deliveryPlace,
      'orden.condicionPago': supplier.paymentTermDays
        ? `Crédito a ${supplier.paymentTermDays} días`
        : 'Contado',
      'orden.notas': order.notes ?? '',
      'orden.total': formatMoney(total),
      'orden.totalEnLetras': numberToWordsEs(total),
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
