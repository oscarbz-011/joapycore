import { Injectable } from '@nestjs/common';
import { OnDomainEvent } from '../../../common/events/on-domain-event.decorator';
import type { DomainEvents } from '../../../common/events/domain-events';
import { SaleOrdersRepository } from '../repositories/sale-orders.repository';

type BatchConsumedEvent = DomainEvents['inventory.batch.consumed'];

/** Anota en cada renglón de la venta el lote del que salió la mercadería. */
@Injectable()
export class SalesOnBatchConsumedListener {
  constructor(private readonly saleOrdersRepository: SaleOrdersRepository) {}

  @OnDomainEvent('inventory.batch.consumed', {
    consumer: 'sales.record-sold-batch',
    suppressErrors: false,
  })
  async handle(event: BatchConsumedEvent) {
    for (const line of event.lines) {
      await this.saleOrdersRepository.setItemBatch(
        event.tenantId,
        line.saleItemId,
        line.batchId,
      );
    }
  }
}
