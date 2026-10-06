import { EVENT_LISTENER_METADATA } from '@nestjs/event-emitter/dist/constants';
import { QuoteOnCreateListener } from './quote-on-create.listener';

// @OnEvent con un array registra UN evento con esa ruta, no una lista: el
// generador dejaría de escuchar. Se fija qué evento atiende cada método.
function eventsOf(method: 'handle' | 'handleRetry'): unknown[] {
  const metadata =
    (Reflect.getMetadata(
      EVENT_LISTENER_METADATA,
      QuoteOnCreateListener.prototype[method],
    ) as Array<{ event: unknown }> | undefined) ?? [];
  return metadata.map((entry) => entry.event);
}

describe('QuoteOnCreateListener events', () => {
  it('generates the PDF when a quote is created', () => {
    expect(eventsOf('handle')).toEqual(['sale.order.quoted']);
  });

  it('regenerates the PDF on a manual retry', () => {
    expect(eventsOf('handleRetry')).toEqual(['sale.order.quote_pdf.requested']);
  });
});
