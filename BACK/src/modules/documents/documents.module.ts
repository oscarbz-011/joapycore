import { Module } from '@nestjs/common';
import { EmailModule } from '../../email/email.module';
import { FilesModule } from '../../files/files.module';
import { DocumentsController } from './controllers/documents.controller';
import { InterestInvoiceOnIssueListener } from './events/interest-invoice-on-issue.listener';
import { InvoiceOnIssueListener } from './events/invoice-on-issue.listener';
import { QuoteOnCreateListener } from './events/quote-on-create.listener';
import { PurchaseOrderPdfListener } from './events/purchase-order-pdf.listener';
import { ReceiptOnPaymentListener } from './events/receipt-on-payment.listener';
import { SaleContractOnInvoiceListener } from './events/sale-contract-on-invoice.listener';
import { BillingTemplatesInitialData } from './data/billing-templates.initial-data';
import { DocumentCategoriesInitialData } from './data/categories.initial-data';
import { DocumentCategoriesRepository } from './repositories/document-categories.repository';
import { DocumentSourcesRepository } from './repositories/document-sources.repository';
import { DocumentsRepository } from './repositories/documents.repository';
import { DocumentsService } from './services/documents.service';

@Module({
  imports: [FilesModule, EmailModule],
  controllers: [DocumentsController],
  providers: [
    DocumentsService,
    DocumentsRepository,
    DocumentSourcesRepository,
    DocumentCategoriesRepository,
    SaleContractOnInvoiceListener,
    DocumentCategoriesInitialData,
    InvoiceOnIssueListener,
    InterestInvoiceOnIssueListener,
    ReceiptOnPaymentListener,
    BillingTemplatesInitialData,
    QuoteOnCreateListener,
    PurchaseOrderPdfListener,
  ],
})
export class DocumentsModule {}
