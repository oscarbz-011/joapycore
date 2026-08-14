import { Injectable } from '@nestjs/common';
import { InvoiceStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaClientOrTx } from '../../../prisma/types';

@Injectable()
export class InvoicesRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get include() {
    return {
      saleOrder: {
        include: {
          customer: true,
          loan: { select: { totalAmount: true, interestRate: true } },
        },
      },
      items: true,
    };
  }

  findAll(tenantId: string) {
    return this.prisma.invoice.findMany({
      where: { tenantId },
      include: this.include,
      orderBy: { createdAt: 'desc' },
    });
  }

  findById(tenantId: string, id: string) {
    return this.prisma.invoice.findFirst({
      where: { id, tenantId },
      include: this.include,
    });
  }

  findBySaleOrder(tenantId: string, saleOrderId: string) {
    return this.prisma.invoice.findFirst({
      where: { tenantId, saleOrderId },
      include: this.include,
    });
  }

  create(
    data: Prisma.InvoiceUncheckedCreateInput,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.invoice.create({ data });
  }

  createItem(
    data: Prisma.InvoiceItemUncheckedCreateInput,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.invoiceItem.create({ data });
  }

  updateStatus(
    tenantId: string,
    id: string,
    status: InvoiceStatus,
    extra?: Partial<Prisma.InvoiceUpdateInput>,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.invoice.updateMany({
      where: { id, tenantId },
      data: { status, ...extra },
    });
  }
}
