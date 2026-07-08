import { Module } from '@nestjs/common';
import { InvoicesController } from './controllers/invoices.controller';
import { BillingOnPaymentListener } from './events/billing-on-payment.listener';
import { BillingOnSaleListener } from './events/billing-on-sale.listener';
import { CreditNotesRepository } from './repositories/credit-notes.repository';
import { InvoicesRepository } from './repositories/invoices.repository';
import { InvoicesService } from './services/invoices.service';

@Module({
  controllers: [InvoicesController],
  providers: [
    InvoicesService,
    InvoicesRepository,
    CreditNotesRepository,
    BillingOnSaleListener,
    BillingOnPaymentListener,
  ],
})
export class BillingModule {}
