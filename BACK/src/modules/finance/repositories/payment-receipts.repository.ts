import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaClientOrTx } from '../../../prisma/types';

const RECEIPT_INCLUDE = {
  items: { orderBy: { installmentNumber: 'asc' as const } },
  loan: { select: { id: true, saleOrderId: true } },
  customer: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      customerCode: true,
      documentType: true,
      documentNumber: true,
    },
  },
  branch: { select: { id: true, name: true, city: true } },
  collectedBy: { select: { id: true, firstName: true, lastName: true } },
  tenant: {
    select: {
      razonSocial: true,
      nombreFantasia: true,
      ruc: true,
      address: true,
      numeroCasa: true,
      city: true,
      phone: true,
      logoFileId: true,
    },
  },
  // Factura de intereses moratorios generada a partir de este recibo,
  // si el cobro incluyó recargos (ver interest-invoice-on-receipt.listener.ts).
  interestInvoice: {
    select: {
      id: true,
      pdfFileId: true,
      invoiceNumber: true,
      invoicePrefix: true,
    },
  },
} satisfies Prisma.PaymentReceiptInclude;

@Injectable()
export class PaymentReceiptsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(tenantId: string, id: string) {
    return this.prisma.paymentReceipt.findFirst({
      where: { id, tenantId },
      include: RECEIPT_INCLUDE,
    });
  }

  // Recibo más reciente que incluye un ítem de esta cuota.
  findLatestByInstallment(tenantId: string, installmentId: string) {
    return this.prisma.paymentReceipt.findFirst({
      where: { tenantId, items: { some: { installmentId } } },
      include: RECEIPT_INCLUDE,
      orderBy: { issuedAt: 'desc' },
    });
  }

  findLastSequential(
    tenantId: string,
    establecimiento: string,
    puntoExpedicion: string,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.paymentReceipt.findFirst({
      where: { tenantId, establecimiento, puntoExpedicion },
      orderBy: { sequential: 'desc' },
      select: { sequential: true },
    });
  }

  create(
    data: Prisma.PaymentReceiptUncheckedCreateInput,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.paymentReceipt.create({ data, include: RECEIPT_INCLUDE });
  }
}
