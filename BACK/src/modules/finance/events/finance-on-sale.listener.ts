import { Injectable, Logger } from '@nestjs/common';
import { OnDomainEvent } from '../../../common/events/on-domain-event.decorator';
import { LoansService } from '../services/loans.service';
import type { DomainEvents } from '../../../common/events/domain-events';

type SaleCreditApprovedEvent = DomainEvents['sale.credit.approved'];

type InvoiceDueDateSelectedEvent = DomainEvents['invoice.duedate.selected'];

@Injectable()
export class FinanceOnSaleListener {
  private readonly logger = new Logger(FinanceOnSaleListener.name);

  constructor(private readonly loansService: LoansService) {}

  @OnDomainEvent('sale.credit.approved', { suppressErrors: false })
  async handle(event: SaleCreditApprovedEvent) {
    await this.loansService.createFromOrder(event.tenantId, event.saleOrderId);
  }

  // Si al emitir la factura se eligió un vencimiento distinto al default del
  // tenant, reprograma el cronograma de cuotas para que coincida — corre
  // ANTES de que Documentos genere el PDF de la factura (invoices.service.ts
  // espera este evento antes de emitir 'invoice.issued'), así el PDF ya
  // imprime la fecha correcta de la primera cuota.
  // La reprogramación es parte del flujo crítico de emisión: el PDF debe
  // reflejar la misma primera fecha de vencimiento que quedó en las cuotas.
  @OnDomainEvent('invoice.duedate.selected', { suppressErrors: false })
  async handleDueDateSelected(event: InvoiceDueDateSelectedEvent) {
    try {
      await this.loansService.rescheduleInstallments(
        event.tenantId,
        event.saleOrderId,
        new Date(event.dueDate),
      );
    } catch (error) {
      this.logger.error(
        `No se pudo reprogramar las cuotas del pedido ${event.saleOrderId}: ${(error as Error).message}`,
      );
      throw error;
    }
  }
}
