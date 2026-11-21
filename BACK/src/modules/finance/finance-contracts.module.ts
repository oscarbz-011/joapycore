import { Global, Module } from '@nestjs/common';
import { RECEIPT_PDF } from '../../common/contracts/document-pdf.contract';
import { LOAN_CREDITS } from '../../common/contracts/loan-credits.contract';
import { InstallmentsRepository } from './repositories/installments.repository';
import { LoansRepository } from './repositories/loans.repository';
import { PaymentReceiptsRepository } from './repositories/payment-receipts.repository';
import { LoanCreditsService } from './services/loan-credits.service';

/** Lo que Finanzas ofrece a otros módulos por contrato, sin importar FinanceModule. */
@Global()
@Module({
  providers: [
    LoansRepository,
    InstallmentsRepository,
    LoanCreditsService,
    PaymentReceiptsRepository,
    { provide: LOAN_CREDITS, useExisting: LoanCreditsService },
    { provide: RECEIPT_PDF, useExisting: PaymentReceiptsRepository },
  ],
  exports: [LOAN_CREDITS, RECEIPT_PDF],
})
export class FinanceContractsModule {}
