import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaClientOrTx } from '../../../prisma/types';

/**
 * Lecturas de datos de otros módulos (pedido, préstamo, recibo, sucursal)
 * que Facturación necesita para armar sus facturas. Quedan agrupadas acá
 * para que ningún listener/servicio consulte Prisma directo y para que el
 * acoplamiento de datos entre módulos sea visible en un solo lugar.
 */
@Injectable()
export class BillingSourcesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findSaleOrderForInvoicing(tenantId: string, saleOrderId: string) {
    return this.prisma.saleOrder.findFirst({
      where: { id: saleOrderId, tenantId },
      select: {
        saleType: true,
        items: {
          select: {
            quantity: true,
            unitPrice: true,
            financedUnitPrice: true,
            description: true,
            product: { select: { name: true } },
          },
        },
      },
    });
  }

  findLoanTotalBySaleOrder(tenantId: string, saleOrderId: string) {
    return this.prisma.loan.findFirst({
      where: { saleOrderId, tenantId },
      select: { totalAmount: true },
    });
  }

  findReceiptForInterestInvoice(tenantId: string, receiptId: string) {
    return this.prisma.paymentReceipt.findFirst({
      where: { id: receiptId, tenantId },
      include: {
        items: true,
        loan: {
          include: {
            saleOrder: { include: { invoice: true } },
          },
        },
      },
    });
  }

  findBranchNumbering(
    tenantId: string,
    branchId: string,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.branch.findFirst({
      where: { id: branchId, tenantId },
      select: { codigoEstablecimiento: true, puntoExpedicion: true },
    });
  }
}
