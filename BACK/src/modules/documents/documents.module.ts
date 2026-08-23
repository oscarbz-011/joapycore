import { Module } from '@nestjs/common';
import { EmailModule } from '../../email/email.module';
import { FilesModule } from '../../files/files.module';
import { DocumentsController } from './controllers/documents.controller';
import { InvoiceOnIssueListener } from './events/invoice-on-issue.listener';
import { QuoteOnCreateListener } from './events/quote-on-create.listener';
import { ReceiptOnPaymentListener } from './events/receipt-on-payment.listener';
import { SaleContractOnInvoiceListener } from './events/sale-contract-on-invoice.listener';
import { SeedBillingTemplatesOnTenantRegisteredListener } from './events/seed-billing-templates-on-tenant-registered.listener';
import { SeedDefaultCategoriesOnModuleActivatedListener } from './events/seed-default-categories-on-module-activated.listener';
import { DocumentCategoriesRepository } from './repositories/document-categories.repository';
import { DocumentsRepository } from './repositories/documents.repository';
import { DocumentsService } from './services/documents.service';

@Module({
  imports: [FilesModule, EmailModule],
  controllers: [DocumentsController],
  providers: [
    DocumentsService,
    DocumentsRepository,
    DocumentCategoriesRepository,
    SaleContractOnInvoiceListener,
    SeedDefaultCategoriesOnModuleActivatedListener,
    InvoiceOnIssueListener,
    ReceiptOnPaymentListener,
    SeedBillingTemplatesOnTenantRegisteredListener,
    QuoteOnCreateListener,
  ],
})
export class DocumentsModule {}
