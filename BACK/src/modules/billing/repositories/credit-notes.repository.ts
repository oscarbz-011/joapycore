import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaClientOrTx } from '../../../prisma/types';

@Injectable()
export class CreditNotesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(tenantId: string) {
    return this.prisma.creditNote.findMany({
      where: { tenantId },
      include: {
        invoice: {
          select: {
            id: true,
            total: true,
            saleOrder: { select: { customer: { select: { id: true, firstName: true, lastName: true, email: true } } } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  findByInvoice(tenantId: string, invoiceId: string) {
    return this.prisma.creditNote.findMany({
      where: { tenantId, invoiceId },
      orderBy: { createdAt: 'desc' },
    });
  }

  create(
    data: {
      tenantId: string;
      invoiceId: string;
      reason: string;
      total: number | string;
      number?: string;
    },
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.creditNote.create({ data });
  }

  async generateNumber(tenantId: string): Promise<string> {
    const count = await this.prisma.creditNote.count({ where: { tenantId } });
    return `NC-${String(count + 1).padStart(4, '0')}`;
  }
}
