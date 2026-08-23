import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service';
import { InstallmentsRepository } from '../repositories/installments.repository';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

@Injectable()
export class InstallmentsSchedulerService {
  private readonly logger = new Logger(InstallmentsSchedulerService.name);

  constructor(
    private readonly installmentsRepository: InstallmentsRepository,
    private readonly prisma: PrismaService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async markOverdueInstallments() {
    const result = await this.installmentsRepository.markAllOverdue();
    if (result.count > 0) {
      this.logger.log(`Marked ${result.count} installment(s) as OVERDUE`);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async applyDailyMora() {
    const overdue = await this.installmentsRepository.findAllOverdueForMora();
    if (!overdue.length) return;

    // Batch credit config per tenant to avoid N+1
    const tenantIds = [...new Set(overdue.map((i) => i.tenantId))];
    const configs = await this.prisma.creditConfig.findMany({
      where: { tenantId: { in: tenantIds } },
      select: { tenantId: true, moraRate: true, moraGraceDays: true },
    });
    const moraRateMap = new Map(
      configs.map((c) => [c.tenantId, typeof c.moraRate === 'object' ? (c.moraRate as { toNumber(): number }).toNumber() : Number(c.moraRate)]),
    );
    const graceDaysMap = new Map(configs.map((c) => [c.tenantId, c.moraGraceDays]));

    const now = new Date();
    let updated = 0;

    for (const inst of overdue) {
      const moraRate = moraRateMap.get(inst.tenantId) ?? 0;
      if (moraRate === 0) continue;

      // Días de tolerancia: la mora no empieza a devengarse hasta pasado
      // dueDate + graceDays — y el cómputo de los días transcurridos arranca
      // ahí también, no en dueDate, para no cobrar retroactivamente la
      // tolerancia la primera vez que se calcula.
      const graceDays = graceDaysMap.get(inst.tenantId) ?? 0;
      const graceDeadline = new Date(inst.dueDate.getTime() + graceDays * MS_PER_DAY);
      if (now <= graceDeadline) continue;

      const lastCalc = inst.lastMoraCalculatedAt ?? graceDeadline;
      const daysDelta = Math.floor((now.getTime() - lastCalc.getTime()) / MS_PER_DAY);
      if (daysDelta < 1) continue;

      const amount = typeof inst.amount === 'object' ? (inst.amount as { toNumber(): number }).toNumber() : Number(inst.amount);
      const currentMora = typeof inst.moraAmount === 'object' ? (inst.moraAmount as { toNumber(): number }).toNumber() : Number(inst.moraAmount);
      const dailyMora = amount * (moraRate / 100);
      const newMora = currentMora + dailyMora * daysDelta;

      await this.installmentsRepository.updateMora(inst.id, newMora);
      updated++;
    }

    if (updated > 0) {
      this.logger.log(`Applied daily mora to ${updated} overdue installment(s)`);
    }
  }
}
