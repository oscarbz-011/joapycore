import { Global, Module } from '@nestjs/common';
import { RECEIVABLES } from '../../common/contracts/receivables.contract';
import { AccountsReceivableRepository } from './repositories/accounts-receivable.repository';
import { ReceivablesService } from './services/receivables.service';

/** Lo que Pagos ofrece a otros módulos por contrato, sin importar PaymentsModule. */
@Global()
@Module({
  providers: [
    AccountsReceivableRepository,
    ReceivablesService,
    { provide: RECEIVABLES, useExisting: ReceivablesService },
  ],
  exports: [RECEIVABLES],
})
export class PaymentsContractsModule {}
