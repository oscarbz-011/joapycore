import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

export interface PosSalesHistoryFilters {
  terminalId?: string;
  from?: Date;
  to?: Date;
}

@Injectable()
export class PosSalesRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get include() {
    return {
      customer: { select: { id: true, firstName: true, lastName: true } },
      items: { include: { product: { select: { id: true, name: true } } } },
      salePayments: true,
    };
  }

  findBySession(tenantId: string, posSessionId: string) {
    return this.prisma.saleOrder.findMany({
      where: { tenantId, posSessionId },
      include: this.include,
      orderBy: { createdAt: 'desc' },
    });
  }

  findHistory(tenantId: string, filters: PosSalesHistoryFilters) {
    return this.prisma.saleOrder.findMany({
      where: {
        tenantId,
        channel: 'POS',
        ...(filters.terminalId && {
          posSession: { terminalId: filters.terminalId },
        }),
        ...(filters.from || filters.to
          ? {
              orderDate: {
                ...(filters.from && { gte: filters.from }),
                ...(filters.to && { lte: filters.to }),
              },
            }
          : {}),
      },
      include: this.include,
      orderBy: { createdAt: 'desc' },
    });
  }

  findForReceipt(tenantId: string, saleOrderId: string) {
    return this.prisma.saleOrder.findFirst({
      where: { id: saleOrderId, tenantId, channel: 'POS' },
      select: {
        id: true,
        salePayments: { select: { paymentMethod: true, amount: true } },
        posSession: {
          select: {
            terminal: {
              select: {
                name: true,
                printFormat: true,
                thermalPaperConservation: true,
              },
            },
            cashier: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });
  }
}
