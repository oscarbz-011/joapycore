import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InitialDataRepository {
  constructor(private readonly prisma: PrismaService) {}

  async appliedVersions(tenantId: string): Promise<Map<string, number>> {
    const rows = await this.prisma.tenantModuleData.findMany({
      where: { tenantId },
      select: { dataSet: true, version: true },
    });
    return new Map(rows.map((row) => [row.dataSet, row.version]));
  }

  /** Dos aplicaciones del mismo conjunto a la vez esperan su turno. */
  async lockedVersion(
    tx: Prisma.TransactionClient,
    tenantId: string,
    dataSet: string,
  ): Promise<number> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`initial-data:${tenantId}:${dataSet}`}))`;
    const row = await tx.tenantModuleData.findUnique({
      where: { tenantId_dataSet: { tenantId, dataSet } },
      select: { version: true },
    });
    return row?.version ?? 0;
  }

  saveVersion(
    tx: Prisma.TransactionClient,
    tenantId: string,
    dataSet: string,
    version: number,
  ) {
    return tx.tenantModuleData.upsert({
      where: { tenantId_dataSet: { tenantId, dataSet } },
      create: { tenantId, dataSet, version },
      update: { version, appliedAt: new Date() },
    });
  }

  async industryOf(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { industry: true },
    });
    return tenant?.industry ?? null;
  }

  /** Recorre todas las empresas: se llama en modo plataforma. */
  tenantIds(afterId: string | undefined, take: number) {
    return this.prisma.tenant
      .findMany({
        select: { id: true },
        orderBy: { id: 'asc' },
        take,
        ...(afterId ? { cursor: { id: afterId }, skip: 1 } : {}),
      })
      .then((rows) => rows.map((row) => row.id));
  }
}
