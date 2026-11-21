/**
 * Documentos genera el PDF y el módulo dueño de cada documento lo vincula en
 * el momento, porque quien lo pidió puede depender del vínculo: la factura no
 * se emite sin su comprobante.
 */
export const INVOICE_PDF = Symbol('INVOICE_PDF');
export const RECEIPT_PDF = Symbol('RECEIPT_PDF');
export const QUOTE_PDF = Symbol('QUOTE_PDF');
export const PURCHASE_ORDER_PDF = Symbol('PURCHASE_ORDER_PDF');

export type InvoicePdfStatus = 'PENDING' | 'ISSUED' | 'PAID';

export interface InvoicePdf {
  /**
   * Vincula el PDF solo si la factura sigue en el intento que lo pidió (mismo
   * estado y fecha de emisión, sin PDF previo). Si cambió, lanza.
   */
  attachInvoicePdf(
    tenantId: string,
    invoiceId: string,
    fileId: string,
    attempt: { issuedAt: Date; status: InvoicePdfStatus },
  ): Promise<void>;
}

export interface ReceiptPdf {
  attachReceiptPdf(
    tenantId: string,
    receiptId: string,
    fileId: string,
  ): Promise<void>;
}

export interface QuotePdf {
  attachQuotePdf(
    tenantId: string,
    saleOrderId: string,
    fileId: string,
  ): Promise<void>;
}

export interface PurchaseOrderPdf {
  attachPurchaseOrderPdf(
    tenantId: string,
    purchaseOrderId: string,
    fileId: string,
  ): Promise<void>;
}
