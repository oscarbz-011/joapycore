import { Injectable } from '@nestjs/common';
import { IntegrationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class IntegrationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByKey(tenantId: string, key: string) {
    return this.prisma.tenantIntegration.findUnique({
      where: { tenantId_key: { tenantId, key } },
    });
  }

  upsert(
    tenantId: string,
    key: string,
    data: {
      enabled: boolean;
      status: IntegrationStatus;
      encryptedConfig: string;
      lastError?: string | null;
      lastTestedAt?: Date | null;
      lastTestOk?: boolean | null;
    },
  ) {
    return this.prisma.tenantIntegration.upsert({
      where: { tenantId_key: { tenantId, key } },
      create: { tenantId, key, ...data },
      update: data,
    });
  }

  markTestResult(tenantId: string, key: string, ok: boolean, error?: string) {
    return this.prisma.tenantIntegration.update({
      where: { tenantId_key: { tenantId, key } },
      data: {
        status: ok ? 'CONNECTED' : 'ERROR',
        lastTestedAt: new Date(),
        lastTestOk: ok,
        lastError: error ?? null,
      },
    });
  }
}
