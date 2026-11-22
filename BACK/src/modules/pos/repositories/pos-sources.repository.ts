import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

export interface PosSalesHistoryFilters {
  terminalId?: string;
  from?: Date;
  to?: Date;
}

/** Lecturas de las ventas y los pagos de Ventas que POS muestra y arquea. */
@Injectable()
export class PosSourcesRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Base del efectivo esperado al cerrar la caja.
  sumCashPayments(tenantId: string, sessionId: string) {
    return this.prisma.salePayment.aggregate({
      where: { tenantId, posSessionId: sessionId, paymentMethod: 'CASH' },
      _sum: { amount: true },
    });
  }

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
