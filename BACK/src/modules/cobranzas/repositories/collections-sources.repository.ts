import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

/** Lecturas de datos de Finanzas que Cobranzas necesita, de solo consulta. */
@Injectable()
export class CollectionsSourcesRepository {
  constructor(private readonly prisma: PrismaService) {}

  countOverdueInstallments(tenantId: string) {
    return this.prisma.installment.count({
      where: { tenantId, status: 'OVERDUE' },
    });
  }
}
