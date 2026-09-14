import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CreditConfigRepository {
  constructor(private readonly prisma: PrismaService) {}

  private readonly planOrder = { orderBy: { installments: 'asc' } } as const;
  private readonly componentOrder = { orderBy: { order: 'asc' } } as const;

  findByTenant(tenantId: string) {
    return this.prisma.creditConfig.findUnique({
      where: { tenantId },
      include: {
        plans: this.planOrder,
        interestComponents: this.componentOrder,
      },
    });
  }

  upsertConfig(
    tenantId: string,
    isEnabled: boolean,
    maxIncomePercentage?: number | null,
    dueDayOfMonth?: number,
    moraGraceDays?: number,
    delinquencyThresholdDays?: number | null,
  ) {
    return this.prisma.creditConfig.upsert({
      where: { tenantId },
      create: {
        tenantId,
        isEnabled,
        maxIncomePercentage,
        dueDayOfMonth,
        moraGraceDays,
        delinquencyThresholdDays,
      },
      update: {
        isEnabled,
        ...(maxIncomePercentage !== undefined ? { maxIncomePercentage } : {}),
        ...(dueDayOfMonth !== undefined ? { dueDayOfMonth } : {}),
        ...(moraGraceDays !== undefined ? { moraGraceDays } : {}),
        ...(delinquencyThresholdDays !== undefined
          ? { delinquencyThresholdDays }
          : {}),
      },
      include: {
        plans: this.planOrder,
        interestComponents: this.componentOrder,
      },
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

  createComponent(
    tenantId: string,
    creditConfigId: string,
    data: {
      name: string;
      frequency: 'ONE_TIME' | 'DAILY' | 'MONTHLY';
      percentage: number;
      cumulative?: boolean;
      order?: number;
    },
  ) {
    return this.prisma.interestComponent.create({
      data: { tenantId, creditConfigId, ...data },
    });
  }

  updateComponent(
    id: string,
    data: {
      name?: string;
      frequency?: 'ONE_TIME' | 'DAILY' | 'MONTHLY';
      percentage?: number;
      cumulative?: boolean;
      isActive?: boolean;
      order?: number;
    },
  ) {
    return this.prisma.interestComponent.update({ where: { id }, data });
  }

  deleteComponent(id: string) {
    return this.prisma.interestComponent.delete({ where: { id } });
  }
}
