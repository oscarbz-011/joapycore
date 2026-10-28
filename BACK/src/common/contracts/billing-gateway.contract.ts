import type { BillingModality, PaymentMethod, Prisma } from '@prisma/client';

/**
 * Facturación que usa el POS. La implementa Facturación y se inyecta por
 * token: POS no lee las tablas de Facturación ni importa sus servicios.
 */
export const BILLING_GATEWAY = Symbol('BILLING_GATEWAY');

export interface PosSeriesSummary {
  id: string;
  branchId: string;
  modality: BillingModality;
  establecimiento: string;
  puntoExpedicion: string;
  timbrado: string | null;
  rangeFrom: number;
  rangeTo: number;
  nextNumber: number;
  isInvoiceSeries: boolean;
  /** Por qué no puede numerar hoy, o null si puede. */
  problem: string | null;
}

export interface IssuePosInvoiceInput {
  saleOrderId: string;
  branchId: string;
  seriesId: string;
  /** Número de la hoja del talonario; solo en series de talonario. */
  documentNumber?: number;
  anonymousBuyer: boolean;
  paymentMethod: PaymentMethod | null;
  issuedById: string;
  at: Date;
}

/** Posición sobre la hoja en mm desde el borde superior izquierdo. */
export interface FormPoint {
  x: number;
  y: number;
}

/**
 * Dónde va cada dato al imprimir sobre una hoja de talonario de imprenta.
 * Los importes se alinean a la derecha: su `x` es el borde derecho.
 */
export interface PreprintedLayout {
  pageWidth: number;
  pageHeight: number;
  /** Corrimiento de calibración para toda la hoja. */
  offsetX: number;
  offsetY: number;
  /** Tamaño de letra en puntos. */
  fontSize: number;
  date: FormPoint;
  cashMark: FormPoint;
  creditMark: FormPoint;
  buyerName: FormPoint;
  buyerDocument: FormPoint;
  buyerAddress: FormPoint;
  items: {
    top: number;
    lineHeight: number;
    maxLines: number;
    quantityX: number;
    descriptionX: number;
    descriptionWidth: number;
    unitPriceX: number;
    exemptX: number;
    taxed5X: number;
    taxed10X: number;
  };
  /** Fila de subtotales por tasa; usa las columnas de los ítems. */
  subtotalsY: number;
  total: FormPoint;
  totalInWords: FormPoint;
  iva5: FormPoint;
  iva10: FormPoint;
  ivaTotal: FormPoint;
}

export interface FiscalReceiptLine {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  ivaRate: number;
}

/** Lo que se imprime de una factura (arts. 19 y 20 del Decreto 6539/05). */
export interface FiscalReceipt {
  invoiceId: string;
  modality: BillingModality | null;
  number: string;
  timbrado: string | null;
  timbradoValidFrom: Date | null;
  timbradoValidUntil: Date | null;
  issuedAt: Date | null;
  condition: 'CONTADO' | 'CRÉDITO';
  issuer: {
    name: string;
    fantasyName: string | null;
    ruc: string | null;
    address: string | null;
    city: string | null;
    phone: string | null;
    activity: string | null;
    branchName: string | null;
    branchAddress: string | null;
  };
  buyer: { name: string; document: string; address: string | null };
  lines: FiscalReceiptLine[];
  totals: {
    exempt: number;
    taxed5: number;
    taxed10: number;
    iva5: number;
    iva10: number;
    ivaTotal: number;
    total: number;
  };
  /** Solo con talonario de imprenta: cómo imprimir sobre la hoja. */
  formLayout: PreprintedLayout | null;
}

export interface BillingGateway {
  findSeries(
    tenantId: string,
    seriesId: string,
  ): Promise<PosSeriesSummary | null>;

  /**
   * Factura de una venta de caja, ya cobrada: se guarda pagada y numerada
   * en la transacción de la venta. Devuelve el evento del outbox que quien
   * abrió la transacción despacha después del commit.
   */
  issuePosInvoice(
    tx: Prisma.TransactionClient,
    tenantId: string,
    input: IssuePosInvoiceInput,
  ): Promise<{ invoiceId: string; eventId: string }>;

  /** Genera el PDF A4 en segundo plano; la caja imprime sin esperarlo. */
  requestPdf(tenantId: string, invoiceId: string): void;

  findReceiptBySaleOrder(
    tenantId: string,
    saleOrderId: string,
  ): Promise<FiscalReceipt | null>;
}
