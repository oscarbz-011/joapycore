import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaClientOrTx } from '../../../prisma/types';

// Lo que la lista de cuentas necesita saber de la factura del proveedor.
const INVOICE_SUMMARY = {
  id: true,
  invoiceNumber: true,
  invoiceDate: true,
  status: true,
  total: true,
  estimatedTotal: true,
} as const;

@Injectable()
export class AccountsPayableRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(tenantId: string) {
    return this.prisma.accountsPayable.findMany({
      where: { tenantId },
      include: {
        supplier: true,
        purchaseReceipt: {
          include: { purchaseOrder: { select: { id: true } } },
        },
        supplierPayments: { orderBy: { createdAt: 'asc' } },
        supplierInvoice: { select: INVOICE_SUMMARY },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  findById(
    tenantId: string,
    id: string,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.accountsPayable.findFirst({
      where: { id, tenantId },
      include: {
        supplier: true,
        purchaseReceipt: {
          include: { purchaseOrder: { select: { id: true } } },
        },
        supplierPayments: { orderBy: { createdAt: 'asc' } },
        supplierInvoice: { select: INVOICE_SUMMARY },
      },
    });
  }

  findByPurchaseReceipt(tenantId: string, purchaseReceiptId: string) {
    return this.prisma.accountsPayable.findFirst({
      where: { tenantId, purchaseReceiptId },
    });
  }

  create(
    data: Prisma.AccountsPayableUncheckedCreateInput,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.accountsPayable.create({ data });
  }

  // Atomic increment — elimina la condición de carrera de leer-modificar-escribir
  incrementPaid(
    id: string,
    amount: number,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.accountsPayable.update({
      where: { id },
      data: { paidAmount: { increment: amount } },
      select: { paidAmount: true, amount: true, purchaseReceiptId: true },
    });
  }

  updateStatus(
    id: string,
    status: 'PENDING' | 'PARTIAL' | 'PAID' | 'CANCELLED',
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.accountsPayable.update({
      where: { id },
      data: { status },
    });
  }
}
