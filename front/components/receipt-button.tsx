'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Printer, Receipt } from 'lucide-react';
import { financeApi } from '../lib/api/finance';
import { openPdf } from '../lib/open-pdf';
import {
  documentPdfId,
  isMissingReceipt,
  openReceiptDocument,
  type ReceiptDocument,
} from '../lib/receipt-pdf';
import { Button } from '@/components/ui/button';

// Reimprime el recibo de dinero generado al cobrar una cuota — se busca por
// installmentId (una cuota puede haberse cobrado sola o junto con otras via
// payByAmount, en ambos casos hay un único recibo que la cubre). Si el cobro
// incluyó intereses/mora, se generó además una factura aparte solo por ese
// monto (ver interest-invoice-on-receipt.listener.ts en el backend) — se
// muestra un segundo botón para abrirla cuando corresponde. Si un PDF quedó
// sin generar al cobrar, abrirlo lo regenera primero.
export function ReceiptButton({ installmentId }: { installmentId: string }) {
  const queryClient = useQueryClient();
  const queryKey = ['receipt-for-installment', installmentId];
  const { data: receipt, error: loadError } = useQuery({
    queryKey,
    queryFn: () => financeApi.getReceiptForInstallment(installmentId),
    staleTime: 5 * 60 * 1000,
    // 404 = cuota cobrada antes de que existieran los recibos: no reintentar.
    retry: (failures, error) => !isMissingReceipt(error) && failures < 1,
  });
  const [opening, setOpening] = useState<ReceiptDocument | null>(null);
  const [error, setError] = useState<ReceiptDocument | null>(null);

  if (isMissingReceipt(loadError)) {
    return (
      <span
        className="shrink-0 text-xs text-muted-foreground"
        title="Esta cuota se cobró antes de que el sistema emitiera recibos"
      >
        Sin recibo
      </span>
    );
  }

  async function open(document: ReceiptDocument) {
    if (!receipt) return setError(document);
    setOpening(document);
    setError(null);
    try {
      const updated = await openReceiptDocument(receipt, document, {
        retry: financeApi.retryReceiptPdf,
        open: openPdf,
      });
      if (updated !== receipt) queryClient.setQueryData(queryKey, updated);
    } catch {
      setError(document);
    } finally {
      setOpening(null);
    }
  }

  const label = (document: ReceiptDocument, idle: string) => {
    if (opening === document) {
      return receipt && !documentPdfId(receipt, document)
        ? 'Generando...'
        : 'Abriendo...';
    }
    return error === document ? 'Reintentar' : idle;
  };

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 shrink-0"
        disabled={opening !== null || !receipt}
        onClick={() => open('receipt')}
        title={
          error === 'receipt'
            ? 'No se pudo generar o abrir el recibo. Volvé a intentar.'
            : 'Ver recibo'
        }
      >
        <Printer size={13} />
        {label('receipt', 'Recibo')}
      </Button>
      {receipt?.interestInvoice && (
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 shrink-0"
          disabled={opening !== null}
          onClick={() => open('interestInvoice')}
          title={
            error === 'interestInvoice'
              ? 'No se pudo generar o abrir la factura de intereses. Volvé a intentar.'
              : 'Ver factura de intereses moratorios'
          }
        >
          <Receipt size={13} />
          {label('interestInvoice', 'Factura int.')}
        </Button>
      )}
    </div>
  );
}
