import { EVENT_LISTENER_METADATA } from '@nestjs/event-emitter/dist/constants';
import { InterestInvoiceOnIssueListener } from './interest-invoice-on-issue.listener';
import { ReceiptOnPaymentListener } from './receipt-on-payment.listener';

// EventEmitter2 interpreta un array como la ruta de UN evento, no como una
// lista de eventos: @OnEvent(['a', 'b']) deja al método sin escuchar nada.
// Estos tests fijan qué evento escucha cada generador de PDF.
function eventsOf(target: object, method: string): unknown[] {
  const handler = (target as Record<string, unknown>)[method];
  const metadata =
    (Reflect.getMetadata(EVENT_LISTENER_METADATA, handler as object) as
      Array<{ event: unknown }> | undefined) ?? [];
  return metadata.map((entry) => entry.event);
}

describe('PDF generator listeners', () => {
  it('generates the receipt PDF when a payment receipt is created', () => {
    expect(eventsOf(ReceiptOnPaymentListener.prototype, 'handle')).toEqual([
      'payment.receipt.created',
    ]);
  });

  it('regenerates the receipt PDF on a manual retry', () => {
    expect(eventsOf(ReceiptOnPaymentListener.prototype, 'handleRetry')).toEqual(
      ['payment.receipt.pdf.requested'],
    );
  });

  it('generates and regenerates the interest invoice PDF', () => {
    expect(
      eventsOf(InterestInvoiceOnIssueListener.prototype, 'handle'),
    ).toEqual(['invoice.interest.issued']);
    expect(
      eventsOf(InterestInvoiceOnIssueListener.prototype, 'handleRetry'),
    ).toEqual(['payment.receipt.pdf.requested']);
  });
});
