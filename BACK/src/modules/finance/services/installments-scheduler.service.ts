import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { FinanceSourcesRepository } from '../repositories/finance-sources.repository';
import { InstallmentsRepository } from '../repositories/installments.repository';
import { LoansRepository } from '../repositories/loans.repository';
import { InterestCalcService } from './interest-calc.service';
import { BUSINESS_TIMEZONE } from '../../../common/utils/business-date.util';

function toNum(value: unknown): number {
  if (typeof value === 'object' && value !== null && 'toNumber' in value) {
    return (value as { toNumber(): number }).toNumber();
  }
  return Number(value);
}

@Injectable()
export class InstallmentsSchedulerService {
  private readonly logger = new Logger(InstallmentsSchedulerService.name);

  constructor(
    private readonly installmentsRepository: InstallmentsRepository,
    private readonly sources: FinanceSourcesRepository,
    private readonly loansRepository: LoansRepository,
    private readonly interestCalc: InterestCalcService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT, { timeZone: BUSINESS_TIMEZONE })
  async markOverdueInstallments() {
    const result = await this.installmentsRepository.markAllOverdue();
    if (result.count > 0) {
      this.logger.log(`Marked ${result.count} installment(s) as OVERDUE`);
    }
  }

  // Recalcula desde cero el cargo vigente de cada InterestComponent activo
  // sobre cada cuota vencida — no es un acumulador incremental como el
  // diseño viejo (aplicaba delta día a día), sino que siempre recomputa el
  // valor correcto a partir de dueDate/graceDays/frequency, así que un
  // cambio de configuración (activar/desactivar un componente, cambiar el
  // %) se refleja correctamente la próxima corrida sin arrastrar valores
  // viejos.
  @Cron(CronExpression.EVERY_DAY_AT_1AM, { timeZone: BUSINESS_TIMEZONE })
  async recalculateInterestCharges() {
    // Si el proceso no estaba vivo a medianoche, la corrida de la 01:00 no
    // debe depender de que markOverdueInstallments haya ocurrido antes.
    await this.installmentsRepository.markAllOverdue();
    const overdue = await this.installmentsRepository.findAllOverdueForMora();
    await this.recalculate(overdue);
  }

  /**
   * Actualiza estado y mora justo antes de mostrar o cobrar un préstamo. Esto
   * elimina la ventana en la que el frontend ya detectaba una fecha vencida,
   * pero los cargos seguían vacíos hasta el siguiente cron nocturno.
   */
  async refreshLoanCharges(tenantId: string, loanId: string) {
    await this.installmentsRepository.markLoanOverdue(tenantId, loanId);
    const overdue = await this.installmentsRepository.findAllOverdueForMora({
      tenantId,
      loanId,
    });
    await this.recalculate(overdue);
  }

  private async recalculate(
    overdue: Array<{
      id: string;
      tenantId: string;
      amount: unknown;
      dueDate: Date;
    }>,
  ) {
    if (!overdue.length) return;

    await this.installmentsRepository.clearInactiveInterestCharges(
      overdue.map((inst) => inst.id),
    );

    const tenantIds = [...new Set(overdue.map((i) => i.tenantId))];
    const configs = await this.sources.findMoraConfigs(tenantIds);
    const configByTenant = new Map(configs.map((c) => [c.tenantId, c]));

    const now = new Date();
    let updated = 0;

    for (const inst of overdue) {
      const config = configByTenant.get(inst.tenantId);
      if (!config || config.interestComponents.length === 0) continue;

      const amount = toNum(inst.amount);
      const days = this.interestCalc.daysOverdue(
        inst.dueDate,
        config.moraGraceDays,
        now,
      );
      const periods = this.interestCalc.periodsElapsed(
        inst.dueDate,
        config.moraGraceDays,
        now,
      );

      for (const component of config.interestComponents) {
        const charge = this.interestCalc.computeComponentCharge(
          {
            frequency: component.frequency,
            percentage: toNum(component.percentage),
            cumulative: component.cumulative,
          },
          amount,
          days,
          periods,
        );

        await this.installmentsRepository.upsertInterestCharge(
          inst.id,
          component.id,
          charge,
          periods,
        );
        updated++;
      }
    }

    if (updated > 0) {
      this.logger.log(`Recalculated ${updated} interest charge(s)`);
    }
  }

  // Detecta candidatos a Morosos: por cada tenant con umbral configurado,
  // busca préstamos activos cuya cuota impaga más antigua ya cruzó el
  // umbral de días de mora, y genera un DelinquencyReport en revisión si
  // todavía no existe uno para ese préstamo. Nunca pisa uno ya revisado
  // (REPORTED/EXCLUDED) — la detección automática solo alimenta la cola de
  // revisión, un analista decide qué hacer con cada caso.
  @Cron(CronExpression.EVERY_DAY_AT_1AM, { timeZone: BUSINESS_TIMEZONE })
  async detectDelinquentCustomers() {
    const configs = await this.sources.findDelinquencyConfigs();
    if (!configs.length) return;

    const now = new Date();
    let created = 0;

    for (const config of configs) {
      const threshold = config.delinquencyThresholdDays!;
      const loans = await this.loansRepository.findActiveWithOldestUnpaid(
        config.tenantId,
      );

      for (const loan of loans) {
        const oldest = loan.installments[0];
        if (!oldest) continue;
        const days = this.interestCalc.daysOverdue(
          oldest.dueDate,
          config.moraGraceDays,
          now,
        );
        if (days < threshold) continue;

        const isNew = await this.sources.createDelinquencyReportIfMissing({
          tenantId: config.tenantId,
          customerId: loan.customerId,
          loanId: loan.id,
          daysOverdue: days,
        });
        if (isNew) created++;
      }
    }

    if (created > 0) {
      this.logger.log(`Detected ${created} new delinquency candidate(s)`);
    }
  }
}
