import { Module } from '@nestjs/common';
import { LoansController } from './controllers/loans.controller';
import { FinanceOnArPaidListener } from './events/finance-on-ar-paid.listener';
import { FinanceOnSaleListener } from './events/finance-on-sale.listener';
import { InstallmentsRepository } from './repositories/installments.repository';
import { LoansRepository } from './repositories/loans.repository';
import { InstallmentsSchedulerService } from './services/installments-scheduler.service';
import { LoansService } from './services/loans.service';

@Module({
  controllers: [LoansController],
  providers: [
    LoansService,
    LoansRepository,
    InstallmentsRepository,
    FinanceOnSaleListener,
    FinanceOnArPaidListener,
    InstallmentsSchedulerService,
  ],
  exports: [LoansService],
})
export class FinanceModule {}
