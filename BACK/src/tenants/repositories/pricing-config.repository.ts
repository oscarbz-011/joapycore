import { Injectable } from '@nestjs/common';
import { MarkupMethod } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PricingConfigRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByTenant(tenantId: string) {
    return this.prisma.pricingConfig.findUnique({ where: { tenantId } });
  }

  upsert(tenantId: string, data: { markupMethod: MarkupMethod; defaultMarkup: number }) {
    return this.prisma.pricingConfig.upsert({
      where: { tenantId },
      create: { tenantId, ...data },
      update: data,
    });
  }
}
