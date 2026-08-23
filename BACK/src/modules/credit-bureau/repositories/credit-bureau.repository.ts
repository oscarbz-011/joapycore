import { Injectable } from '@nestjs/common';
import { CreditBureauCheckFrequency, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

export interface UpsertCreditBureauConfigData {
  isEnabled: boolean;
  checkFrequency: CreditBureauCheckFrequency;
}

@Injectable()
export class CreditBureauRepository {
  constructor(private readonly prisma: PrismaService) {}

  findConfigByTenant(tenantId: string) {
    return this.prisma.creditBureauConfig.findUnique({ where: { tenantId } });
  }

  upsertConfig(tenantId: string, data: UpsertCreditBureauConfigData) {
    return this.prisma.creditBureauConfig.upsert({
      where: { tenantId },
      create: { tenantId, ...data },
      update: data,
    });
  }

  createCheck(data: Prisma.CreditBureauCheckUncheckedCreateInput) {
    return this.prisma.creditBureauCheck.create({ data });
  }

  findChecksByCustomer(tenantId: string, customerId: string) {
    return this.prisma.creditBureauCheck.findMany({
      where: { tenantId, customerId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
