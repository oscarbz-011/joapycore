import type {
  BillingModality,
  DocumentType,
  TaxpayerType,
} from '@prisma/client';
import type { FiscalReceipt } from '../../../common/contracts/billing-gateway.contract';
import { toNum } from './invoice-items.util';
import { resolvePreprintedLayout } from './preprinted-layout';

type Numeric = number | { toNumber(): number };

interface ReceiptCustomer {
  firstName: string;
  secondFirstName: string | null;
  lastName: string;
  secondLastName: string | null;
  documentType: DocumentType | null;
  documentNumber: string | null;
  taxpayerType: TaxpayerType | null;
  address: string | null;
}

interface ReceiptBranch {
  name: string;
  address: string | null;
  numeroCasa: string | null;
  city: string | null;
}

export interface InvoiceForReceipt {
  id: string;
  modality: BillingModality | null;
  invoicePrefix: string | null;
  invoiceNumber: string | null;
  timbrado: string | null;
  timbradoValidFrom: Date | null;
  timbradoValidUntil: Date | null;
  issuedAt: Date | null;
  total: Numeric;
  anonymousBuyer: boolean;
  tenant: {
    name: string;
    razonSocial: string | null;
    nombreFantasia: string | null;
    ruc: string | null;
    address: string | null;
    numeroCasa: string | null;
    city: string | null;
    phone: string | null;
    actividadesEconomicas: unknown;
  };
  saleOrder: {
    saleType: string;
    customer: ReceiptCustomer;
    branch: ReceiptBranch | null;
  } | null;
  // Factura de intereses: no tiene venta, el cliente es el del cobro.
  paymentReceipt?: {
    customer: ReceiptCustomer;
    branch: ReceiptBranch | null;
  } | null;
  series?: { printLayout: unknown } | null;
  items: {
    description: string;
    quantity: number;
    unitPrice: Numeric;
    total: Numeric;
    ivaRate: Numeric | null;
    ivaAmount: Numeric | null;
  }[];
}

const DOCUMENT_LABELS: Record<DocumentType, string> = {
  CI: 'CI',
  RUC: 'RUC',
  PASSPORT: 'Pasaporte',
};

const joinAddress = (street: string | null, number: string | null) =>
  [street, number].filter(Boolean).join(' ') || null;

function firstActivity(value: unknown): string | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const first = value[0] as { descripcion?: unknown };
  return typeof first?.descripcion === 'string' ? first.descripcion : null;
}

// Consumidor final que no se identifica: "Sin Nombre" y una X en RUC y
// documento (art. 20 del Decreto 6539/05, según el Decreto 10797/13).
function buyerOf(invoice: InvoiceForReceipt): FiscalReceipt['buyer'] {
  const customer =
    invoice.saleOrder?.customer ?? invoice.paymentReceipt?.customer;
  if (invoice.anonymousBuyer || !customer) {
    return { name: 'Sin Nombre', document: 'X', address: null };
  }
  const name =
    customer.taxpayerType === 'COMPANY'
      ? customer.firstName
      : [
          customer.firstName,
          customer.secondFirstName,
          customer.lastName,
          customer.secondLastName,
        ]
          .filter(Boolean)
          .join(' ');
  const document = customer.documentNumber
    ? `${DOCUMENT_LABELS[customer.documentType ?? 'CI']} ${customer.documentNumber}`
    : 'X';
  return { name, document, address: customer.address };
}

export function buildFiscalReceipt(invoice: InvoiceForReceipt): FiscalReceipt {
  const totals = {
    exempt: 0,
    taxed5: 0,
    taxed10: 0,
    iva5: 0,
    iva10: 0,
    ivaTotal: 0,
    total: toNum(invoice.total),
  };
  const lines = invoice.items.map((item) => {
    const total = toNum(item.total);
    const ivaRate = item.ivaRate == null ? 0 : toNum(item.ivaRate);
    const ivaAmount =
      item.ivaAmount == null
        ? Math.round((total * ivaRate) / (100 + ivaRate))
        : toNum(item.ivaAmount);
    if (ivaRate === 5) {
      totals.taxed5 += total;
      totals.iva5 += ivaAmount;
    } else if (ivaRate === 10) {
      totals.taxed10 += total;
      totals.iva10 += ivaAmount;
    } else {
      totals.exempt += total;
    }
    return {
      description: item.description,
      quantity: item.quantity,
      unitPrice: toNum(item.unitPrice),
      total,
      ivaRate,
    };
  });
  totals.ivaTotal = totals.iva5 + totals.iva10;

  const branch =
    invoice.saleOrder?.branch ?? invoice.paymentReceipt?.branch ?? null;
  return {
    invoiceId: invoice.id,
    modality: invoice.modality,
    number: `${invoice.invoicePrefix ?? ''}${invoice.invoiceNumber ?? ''}`,
    timbrado: invoice.timbrado,
    timbradoValidFrom: invoice.timbradoValidFrom,
    timbradoValidUntil: invoice.timbradoValidUntil,
    issuedAt: invoice.issuedAt,
    condition: invoice.saleOrder?.saleType === 'CREDIT' ? 'CRÉDITO' : 'CONTADO',
    issuer: {
      name: invoice.tenant.razonSocial ?? invoice.tenant.name,
      fantasyName: invoice.tenant.nombreFantasia,
      ruc: invoice.tenant.ruc,
      address: joinAddress(invoice.tenant.address, invoice.tenant.numeroCasa),
      city: invoice.tenant.city,
      phone: invoice.tenant.phone,
      activity: firstActivity(invoice.tenant.actividadesEconomicas),
      branchName: branch?.name ?? null,
      branchAddress: branch
        ? [joinAddress(branch.address, branch.numeroCasa), branch.city]
            .filter(Boolean)
            .join(', ') || null
        : null,
    },
    buyer: buyerOf(invoice),
    lines,
    totals,
    formLayout:
      invoice.modality === 'PREPRINTED'
        ? resolvePreprintedLayout(invoice.series?.printLayout)
        : null,
  };
}
