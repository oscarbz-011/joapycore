import { Module } from '@nestjs/common';
import { LoansController } from './controllers/loans.controller';
import { FinanceOnArPaidListener } from './events/finance-on-ar-paid.listener';
import { FinanceOnSaleListener } from './events/finance-on-sale.listener';
import { FinanceSourcesRepository } from './repositories/finance-sources.repository';
import { InstallmentsRepository } from './repositories/installments.repository';
import { LoansRepository } from './repositories/loans.repository';
import { PaymentReceiptsRepository } from './repositories/payment-receipts.repository';
import { InstallmentsSchedulerService } from './services/installments-scheduler.service';
import { InterestCalcService } from './services/interest-calc.service';
import { LoansService } from './services/loans.service';

@Module({
  controllers: [LoansController],
  providers: [
    LoansService,
    LoansRepository,
    InstallmentsRepository,
    PaymentReceiptsRepository,
    FinanceSourcesRepository,
    FinanceOnSaleListener,
    FinanceOnArPaidListener,
    InstallmentsSchedulerService,
    InterestCalcService,
  ],
  exports: [LoansService],
})
export class FinanceModule {}
