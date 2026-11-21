import { Global, Module } from '@nestjs/common';
import { RECEIVABLES } from '../../common/contracts/receivables.contract';
import { RECEIVABLES_REPORT_SOURCE } from '../../common/contracts/report-sources.contract';
import { TenantsModule } from '../../tenants/tenants.module';
import { AccountsReceivableRepository } from './repositories/accounts-receivable.repository';
import { ReceivablesReportRepository } from './repositories/receivables-report.repository';
import { ReceivablesService } from './services/receivables.service';
import { ReceivablesReportSourceService } from './services/receivables-report-source.service';

/** Lo que Pagos ofrece a otros módulos por contrato, sin importar PaymentsModule. */
@Global()
@Module({
  imports: [TenantsModule],
  providers: [
    AccountsReceivableRepository,
    ReceivablesService,
    ReceivablesReportRepository,
    ReceivablesReportSourceService,
    { provide: RECEIVABLES, useExisting: ReceivablesService },
    {
      provide: RECEIVABLES_REPORT_SOURCE,
      useExisting: ReceivablesReportSourceService,
    },
  ],
  exports: [RECEIVABLES, RECEIVABLES_REPORT_SOURCE],
})
export class PaymentsContractsModule {}
