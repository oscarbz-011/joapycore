'use client';

import { useState } from 'react';
import { Printer } from 'lucide-react';
import { financeApi } from '../lib/api/finance';
import { openPdf } from '../lib/open-pdf';
import { Button } from '@/components/ui/button';

// Reimprime el recibo de dinero generado al cobrar una cuota — se busca por
// installmentId (una cuota puede haberse cobrado sola o junto con otras via
// payByAmount, en ambos casos hay un único recibo que la cubre).
export function ReceiptButton({ installmentId }: { installmentId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  async function handleClick() {
    setLoading(true);
    setError(false);
    try {
      const receipt = await financeApi.getReceiptForInstallment(installmentId);
      if (!receipt.pdfFileId) throw new Error('sin PDF');
      await openPdf(receipt.pdfFileId);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-1.5 shrink-0"
      disabled={loading}
      onClick={handleClick}
      title={error ? 'No se pudo abrir el recibo' : 'Ver recibo'}
    >
      <Printer size={13} />
      {loading ? 'Abriendo...' : error ? 'Error' : 'Recibo'}
    </Button>
  );
}
