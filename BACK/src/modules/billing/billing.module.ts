import { Module } from '@nestjs/common';
import { InvoicesController } from './controllers/invoices.controller';
import { BillingOnPaymentListener } from './events/billing-on-payment.listener';
import { BillingOnSaleListener } from './events/billing-on-sale.listener';
import { InterestInvoiceOnReceiptListener } from './events/interest-invoice-on-receipt.listener';
import { BillingSourcesRepository } from './repositories/billing-sources.repository';
import { CreditNotesRepository } from './repositories/credit-notes.repository';
import { InvoicesRepository } from './repositories/invoices.repository';
import { InvoicesService } from './services/invoices.service';

@Module({
  controllers: [InvoicesController],
  providers: [
    InvoicesService,
    InvoicesRepository,
    CreditNotesRepository,
    BillingSourcesRepository,
    BillingOnSaleListener,
    BillingOnPaymentListener,
    InterestInvoiceOnReceiptListener,
  ],
})
export class BillingModule {}
