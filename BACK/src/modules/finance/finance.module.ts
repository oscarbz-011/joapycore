import { Module } from '@nestjs/common';
import { LoansController } from './controllers/loans.controller';
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
    InstallmentsSchedulerService,
  ],
  exports: [LoansService],
})
export class FinanceModule {}
