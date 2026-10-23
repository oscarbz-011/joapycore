import { BillingModality } from '@prisma/client';

// Lo que imprime el sistema para una factura de talonario es solo un
// respaldo: el comprobante fiscal es la hoja del talonario.
export const INTERNAL_COPY_LEGEND =
  'COPIA INTERNA – NO VÁLIDA COMO COMPROBANTE FISCAL';

function formatCalendarDate(value: Date | null | undefined): string {
  if (!value) return '—';
  return value.toLocaleDateString('es-PY', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function invoiceFiscalVariables(invoice: {
  modality: BillingModality | null;
  timbrado: string | null;
  timbradoValidFrom: Date | null;
  timbradoValidUntil: Date | null;
}): Record<string, string> {
  return {
    'timbrado.numero': invoice.timbrado ?? '',
    'timbrado.inicioVigencia': formatCalendarDate(invoice.timbradoValidFrom),
    'timbrado.finVigencia': formatCalendarDate(invoice.timbradoValidUntil),
    'factura.leyendaFiscal':
      invoice.modality === BillingModality.PREPRINTED
        ? INTERNAL_COPY_LEGEND
        : '',
  };
}

export function invoiceWatermark(invoice: {
  modality: BillingModality | null;
}): string | undefined {
  return invoice.modality === BillingModality.PREPRINTED
    ? INTERNAL_COPY_LEGEND
    : undefined;
}
