import type { BillingSeries } from './api/billing';
import type { PosPrintFormat, PosTerminal } from './api/pos';
import { isThermal, thermalProblem } from './pos-receipt';

/** Series que puede usar una caja: de facturas, activas, de su sucursal y no electrónicas. */
export function seriesForTerminal(series: BillingSeries[], branchId: string): BillingSeries[] {
  return series.filter(
    (s) =>
      s.branchId === branchId &&
      s.documentType === 'INVOICE' &&
      s.isActive &&
      s.modality !== 'ELECTRONIC',
  );
}

export interface TerminalInvoicingForm {
  invoiceSeriesId: string | null;
  printFormat: PosPrintFormat;
  thermalPaperReportFileId: string | null;
  thermalPaperConservation: string;
}

export function terminalToInvoicingForm(terminal: PosTerminal): TerminalInvoicingForm {
  return {
    invoiceSeriesId: terminal.invoiceSeriesId,
    printFormat: terminal.printFormat,
    thermalPaperReportFileId: terminal.thermalPaperReportFileId,
    thermalPaperConservation: terminal.thermalPaperConservation ?? '',
  };
}

/** Por qué no se puede guardar la configuración de facturación, o null. */
export function invoicingFormProblem(form: TerminalInvoicingForm): string | null {
  if (!isThermal(form.printFormat)) return null;
  return thermalProblem(form);
}
