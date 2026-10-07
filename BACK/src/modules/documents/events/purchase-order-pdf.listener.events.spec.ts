import { EVENT_LISTENER_METADATA } from '@nestjs/event-emitter/dist/constants';
import { PurchaseOrderPdfListener } from './purchase-order-pdf.listener';

// Compras pide el PDF por nombre de evento, sin importar este módulo: si el
// nombre cambia de un lado solo, la orden queda sin PDF y nada lo avisa.
describe('PurchaseOrderPdfListener events', () => {
  it('generates the PDF when Procurement asks for it', () => {
    const metadata =
      (Reflect.getMetadata(
        EVENT_LISTENER_METADATA,
        PurchaseOrderPdfListener.prototype.handle,
      ) as Array<{ event: unknown }> | undefined) ?? [];

    expect(metadata.map((entry) => entry.event)).toEqual([
      'purchase.order.pdf.requested',
    ]);
  });
});
