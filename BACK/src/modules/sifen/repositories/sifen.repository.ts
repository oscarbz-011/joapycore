import { Injectable } from '@nestjs/common';
import { SifenEnvironment } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

export interface UpsertSifenConfigData {
  environment?: SifenEnvironment;
  certFilename?: string | null;
  certData?: Buffer | null;
  certPassword?: string | null;
  certType?: string | null;
  certValidFrom?: Date | null;
  certValidUntil?: Date | null;
  certSubject?: string | null;
  caCertFilename?: string | null;
  caCertData?: Buffer | null;
  isConfigured?: boolean;
  lastTestedAt?: Date | null;
  lastTestOk?: boolean | null;
}

@Injectable()
export class SifenRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByTenant(tenantId: string) {
    return this.prisma.sifenConfig.findUnique({ where: { tenantId } });
  }

  upsert(tenantId: string, data: UpsertSifenConfigData) {
    // Cast needed: Prisma Bytes expects Uint8Array<ArrayBuffer> but Buffer uses ArrayBufferLike
    const d = data as Record<string, unknown>;
    return this.prisma.sifenConfig.upsert({
      where: { tenantId },
      create: { tenantId, ...d } as Parameters<typeof this.prisma.sifenConfig.upsert>[0]['create'],
      update: d as Parameters<typeof this.prisma.sifenConfig.upsert>[0]['update'],
    });
  }
}
