'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Printer, Receipt } from 'lucide-react';
import { financeApi } from '../lib/api/finance';
import { openPdf } from '../lib/open-pdf';
import { Button } from '@/components/ui/button';

// Reimprime el recibo de dinero generado al cobrar una cuota — se busca por
// installmentId (una cuota puede haberse cobrado sola o junto con otras via
// payByAmount, en ambos casos hay un único recibo que la cubre). Si el cobro
// incluyó intereses/mora, se generó además una factura aparte solo por ese
// monto (ver interest-invoice-on-receipt.listener.ts en el backend) — se
// muestra un segundo botón para abrirla cuando corresponde.
export function ReceiptButton({ installmentId }: { installmentId: string }) {
  const { data: receipt } = useQuery({
    queryKey: ['receipt-for-installment', installmentId],
    queryFn: () => financeApi.getReceiptForInstallment(installmentId),
    staleTime: 5 * 60 * 1000,
  });
  const [openingReceipt, setOpeningReceipt] = useState(false);
  const [openingInvoice, setOpeningInvoice] = useState(false);
  const [error, setError] = useState<'receipt' | 'invoice' | null>(null);

  async function openReceipt() {
    if (!receipt?.pdfFileId) return setError('receipt');
    setOpeningReceipt(true);
    setError(null);
    try {
      await openPdf(receipt.pdfFileId);
    } catch {
      setError('receipt');
    } finally {
      setOpeningReceipt(false);
    }
  }

  async function openInterestInvoice() {
    if (!receipt?.interestInvoice?.pdfFileId) return setError('invoice');
    setOpeningInvoice(true);
    setError(null);
    try {
      await openPdf(receipt.interestInvoice.pdfFileId);
    } catch {
      setError('invoice');
    } finally {
      setOpeningInvoice(false);
    }
  }

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 shrink-0"
        disabled={openingReceipt}
        onClick={openReceipt}
        title={error === 'receipt' ? 'No se pudo abrir el recibo' : 'Ver recibo'}
      >
        <Printer size={13} />
        {openingReceipt ? 'Abriendo...' : error === 'receipt' ? 'Error' : 'Recibo'}
      </Button>
      {receipt?.interestInvoice && (
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 shrink-0"
          disabled={openingInvoice}
          onClick={openInterestInvoice}
          title={
            error === 'invoice'
              ? 'No se pudo abrir la factura de intereses'
              : 'Ver factura de intereses moratorios'
          }
        >
          <Receipt size={13} />
          {openingInvoice ? 'Abriendo...' : error === 'invoice' ? 'Error' : 'Factura int.'}
        </Button>
      )}
    </div>
  );
}
