import { isApiError } from './api/api-error';
import type { PaymentReceipt } from './api/finance';

export type ReceiptDocument = 'receipt' | 'interestInvoice';

/** Id del PDF de un documento del cobro, o null si quedó sin generar. */
export function documentPdfId(
  receipt: PaymentReceipt,
  document: ReceiptDocument,
): string | null {
  return document === 'receipt'
    ? receipt.pdfFileId
    : (receipt.interestInvoice?.pdfFileId ?? null);
}

/**
 * Abre el PDF pedido; si quedó sin generar al cobrar, primero le pide al
 * backend que regenere los PDFs faltantes de ese cobro. Devuelve el recibo
 * actualizado para refrescar la caché.
 */
export async function openReceiptDocument(
  receipt: PaymentReceipt,
  document: ReceiptDocument,
  deps: {
    retry: (receiptId: string) => Promise<PaymentReceipt>;
    open: (fileId: string) => Promise<void>;
  },
): Promise<PaymentReceipt> {
  const current = documentPdfId(receipt, document)
    ? receipt
    : await deps.retry(receipt.id);
  const fileId = documentPdfId(current, document);
  if (!fileId) throw new Error('El PDF sigue sin generarse');
  await deps.open(fileId);
  return current;
}

/** Cuotas cobradas antes de que existieran los recibos: el backend responde 404. */
export function isMissingReceipt(error: unknown): boolean {
  return isApiError(error) && error.status === 404;
}
