import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { LoansService } from '../services/loans.service';

interface SaleCreditApprovedEvent {
  tenantId: string;
  saleOrderId: string;
}

@Injectable()
export class FinanceOnSaleListener {
  constructor(private readonly loansService: LoansService) {}

  @OnEvent('sale.credit.approved')
  async handle(event: SaleCreditApprovedEvent) {
    await this.loansService.createFromOrder(event.tenantId, event.saleOrderId);
  }
}
