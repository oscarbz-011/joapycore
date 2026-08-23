import { Injectable } from '@nestjs/common';
import { InvoiceStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaClientOrTx } from '../../../prisma/types';

@Injectable()
export class InvoicesRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get include() {
    return {
      tenant: {
        select: {
          razonSocial: true,
          nombreFantasia: true,
          ruc: true,
          address: true,
          numeroCasa: true,
          city: true,
          department: true,
          phone: true,
          logoFileId: true,
          timbradoNumero: true,
          timbradoFecha: true,
          timbradoFechaFin: true,
        },
      },
      saleOrder: {
        include: {
          customer: true,
          downPayment: true,
          loan: {
            select: {
              totalAmount: true,
              interestRate: true,
              totalInstallments: true,
              installments: {
                orderBy: { number: 'asc' as const },
                take: 1,
                select: { dueDate: true },
              },
            },
          },
          branch: {
            select: {
              id: true,
              name: true,
              address: true,
              numeroCasa: true,
              city: true,
              phone: true,
              codigoEstablecimiento: true,
              puntoExpedicion: true,
            },
          },
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
