import { Module } from '@nestjs/common';
import { InvoicesController } from './controllers/invoices.controller';
import { BillingOnSaleListener } from './events/billing-on-sale.listener';
import { InvoicesRepository } from './repositories/invoices.repository';
import { InvoicesService } from './services/invoices.service';

@Module({
  controllers: [InvoicesController],
  providers: [InvoicesService, InvoicesRepository, BillingOnSaleListener],
})
export class BillingModule {}
