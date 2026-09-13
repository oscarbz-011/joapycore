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
    // Prisma tipa Bytes como Uint8Array<ArrayBuffer> y Buffer es
    // Uint8Array<ArrayBufferLike>: se copia a un Uint8Array en vez de
    // castear todo el objeto (el cast ocultaba cualquier otro error de tipos).
    const { certData, caCertData, ...rest } = data;
    const d = {
      ...rest,
      ...(certData !== undefined ? { certData: toBytes(certData) } : {}),
      ...(caCertData !== undefined ? { caCertData: toBytes(caCertData) } : {}),
    };
    return this.prisma.sifenConfig.upsert({
      where: { tenantId },
      create: { tenantId, ...d },
      update: d,
    });
  }
}

function toBytes(buffer: Buffer | null): Uint8Array<ArrayBuffer> | null {
  return buffer ? new Uint8Array(buffer) : null;
}
