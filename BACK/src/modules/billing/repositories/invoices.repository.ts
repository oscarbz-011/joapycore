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
    // Solo facturas de venta — las de intereses moratorios (invoiceType
    // INTEREST) no tienen saleOrder y se acceden desde el recibo de pago que
    // las generó, no desde el listado general de Facturación.
    return this.prisma.invoice.findMany({
      where: { tenantId, invoiceType: 'SALE' },
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

  createInterestInvoice(
    tenantId: string,
    data: {
      paymentReceiptId: string;
      establecimiento: string;
      puntoExpedicion: string;
      sequential: number;
      invoiceNumber: string;
      invoicePrefix: string;
      total: number;
      issuedAt: Date;
      items: {
        description: string;
        quantity: number;
        unitPrice: number;
        total: number;
        ivaRate: number;
        ivaAmount: number;
        unitPriceWithoutIva: number;
      }[];
    },
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.invoice.create({
      data: {
        tenantId,
        invoiceType: 'INTEREST',
        status: 'PAID',
        saleOrderId: null,
        paymentReceiptId: data.paymentReceiptId,
        establecimiento: data.establecimiento,
        puntoExpedicion: data.puntoExpedicion,
        sequential: data.sequential,
        invoiceNumber: data.invoiceNumber,
        invoicePrefix: data.invoicePrefix,
        total: data.total,
        issuedAt: data.issuedAt,
        items: { create: data.items },
      },
      include: { items: true },
    });
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
