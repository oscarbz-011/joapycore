import { Injectable } from '@nestjs/common';
import { OnDomainEvent } from '../../../common/events/on-domain-event.decorator';
import type { DomainEvents } from '../../../common/events/domain-events';
import { CustomersRepository } from '../repositories/customers.repository';

type LocationCorrectedEvent = DomainEvents['delivery.location.corrected'];

/** Guarda en el cliente la ubicación que corrigió el repartidor. */
@Injectable()
export class SalesOnLocationCorrectedListener {
  constructor(private readonly customersRepository: CustomersRepository) {}

  @OnDomainEvent('delivery.location.corrected', {
    consumer: 'sales.correct-customer-location',
    suppressErrors: false,
  })
  async handle(event: LocationCorrectedEvent) {
    await this.customersRepository.correctLocation(
      event.tenantId,
      event.customerId,
      {
        latitude: event.latitude,
        longitude: event.longitude,
        correctedAt: new Date(event.correctedAt),
      },
    );
  }
}
