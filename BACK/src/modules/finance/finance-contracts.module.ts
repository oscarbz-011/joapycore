import { Global, Module } from '@nestjs/common';
import { LOAN_CREDITS } from '../../common/contracts/loan-credits.contract';
import { InstallmentsRepository } from './repositories/installments.repository';
import { LoansRepository } from './repositories/loans.repository';
import { LoanCreditsService } from './services/loan-credits.service';

/** Lo que Finanzas ofrece a otros módulos por contrato, sin importar FinanceModule. */
@Global()
@Module({
  providers: [
    LoansRepository,
    InstallmentsRepository,
    LoanCreditsService,
    { provide: LOAN_CREDITS, useExisting: LoanCreditsService },
  ],
  exports: [LOAN_CREDITS],
})
export class FinanceContractsModule {}
