import { Module } from '@nestjs/common';
import { PaymentsController } from './controllers/payments.controller';
import { PaymentsOnInstallmentListener } from './events/payments-on-installment.listener';
import { PaymentsOnInvoiceListener } from './events/payments-on-invoice.listener';
import { AccountsReceivableRepository } from './repositories/accounts-receivable.repository';
import { PaymentRecordsRepository } from './repositories/payment-records.repository';
import { PaymentsService } from './services/payments.service';

@Module({
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    AccountsReceivableRepository,
    PaymentRecordsRepository,
    PaymentsOnInvoiceListener,
    PaymentsOnInstallmentListener,
  ],
})
export class PaymentsModule {}
