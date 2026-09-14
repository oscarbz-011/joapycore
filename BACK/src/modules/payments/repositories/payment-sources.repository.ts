import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * Lecturas de datos de otros módulos (facturas, recibos de cuotas) que
 * Pagos necesita para sus cuentas por cobrar y reportes de recaudación.
 */
@Injectable()
export class PaymentSourcesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findInvoiceIdBySaleOrder(tenantId: string, saleOrderId: string) {
    return this.prisma.invoice.findFirst({
      where: { saleOrderId, tenantId },
      select: { id: true },
    });
  }

  findInvoiceForReceivable(tenantId: string, invoiceId: string) {
    return this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
      select: {
        total: true,
        dueDate: true,
        saleOrder: {
          select: {
            saleType: true,
            loan: { select: { totalAmount: true } },
          },
        },
      },
    });
  }

  findReceiptsInRange(tenantId: string, start: Date, end: Date) {
    return this.prisma.paymentReceipt.findMany({
      where: { tenantId, issuedAt: { gte: start, lt: end } },
      select: { totalAmount: true, paymentMethod: true },
    });
  }
}
