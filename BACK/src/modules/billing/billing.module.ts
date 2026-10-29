import { Module } from '@nestjs/common';
import { BillingSeriesController } from './controllers/billing-series.controller';
import { InvoicesController } from './controllers/invoices.controller';
import { BillingOnPaymentListener } from './events/billing-on-payment.listener';
import { BillingOnSaleListener } from './events/billing-on-sale.listener';
import { InterestInvoiceOnReceiptListener } from './events/interest-invoice-on-receipt.listener';
import { BillingSeriesRepository } from './repositories/billing-series.repository';
import { BillingSourcesRepository } from './repositories/billing-sources.repository';
import { CreditNotesRepository } from './repositories/credit-notes.repository';
import { InvoicesRepository } from './repositories/invoices.repository';
import { BillingSeriesService } from './services/billing-series.service';
import { InvoicesService } from './services/invoices.service';

@Module({
  controllers: [InvoicesController, BillingSeriesController],
  providers: [
    InvoicesService,
    BillingSeriesService,
    BillingSeriesRepository,
    InvoicesRepository,
    CreditNotesRepository,
    BillingSourcesRepository,
    BillingOnSaleListener,
    BillingOnPaymentListener,
    InterestInvoiceOnReceiptListener,
  ],
})
export class BillingModule {}
