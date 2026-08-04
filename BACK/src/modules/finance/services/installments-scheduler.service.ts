import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InstallmentsRepository } from '../repositories/installments.repository';

@Injectable()
export class InstallmentsSchedulerService {
  private readonly logger = new Logger(InstallmentsSchedulerService.name);

  constructor(private readonly installmentsRepository: InstallmentsRepository) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async markOverdueInstallments() {
    const result = await this.installmentsRepository.markAllOverdue();
    if (result.count > 0) {
      this.logger.log(`Marked ${result.count} installment(s) as OVERDUE`);
    }
  }
}
