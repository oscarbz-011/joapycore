import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CreditConfigRepository {
  constructor(private readonly prisma: PrismaService) {}

  private readonly planOrder = { orderBy: { installments: 'asc' } } as const;

  findByTenant(tenantId: string) {
    return this.prisma.creditConfig.findUnique({
      where: { tenantId },
      include: { plans: this.planOrder },
    });
  }

  upsertConfig(
    tenantId: string,
    isEnabled: boolean,
    maxIncomePercentage?: number | null,
    dueDayOfMonth?: number,
    moraGraceDays?: number,
  ) {
    return this.prisma.creditConfig.upsert({
      where: { tenantId },
      create: { tenantId, isEnabled, maxIncomePercentage, dueDayOfMonth, moraGraceDays },
      update: {
        isEnabled,
        ...(maxIncomePercentage !== undefined ? { maxIncomePercentage } : {}),
        ...(dueDayOfMonth !== undefined ? { dueDayOfMonth } : {}),
        ...(moraGraceDays !== undefined ? { moraGraceDays } : {}),
      },
      include: { plans: this.planOrder },
    });
  }

  createPlan(
    creditConfigId: string,
    installments: number,
    interestRate: number,
  ) {
    return this.prisma.creditPlan.create({
      data: { creditConfigId, installments, interestRate },
    });
  }

  updatePlan(id: string, data: { interestRate?: number; isActive?: boolean }) {
    return this.prisma.creditPlan.update({ where: { id }, data });
  }

  deletePlan(id: string) {
    return this.prisma.creditPlan.delete({ where: { id } });
  }
}
