import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaClientOrTx } from '../../../prisma/types';

const PERSON = { select: { id: true, firstName: true, lastName: true } };

const RECEIPT_FOR_INVOICE = {
  select: {
    id: true,
    receiptNumber: true,
    receivedAt: true,
    purchaseOrder: { select: { id: true, orderNumber: true } },
    items: {
      select: {
        id: true,
        quantity: true,
        unitCost: true,
        product: { select: { id: true, name: true, unit: true } },
      },
    },
  },
} satisfies Prisma.PurchaseReceiptDefaultArgs;

const WITH_DETAIL = {
  supplier: { select: { id: true, name: true, paymentTermDays: true } },
  createdBy: PERSON,
  reviewedBy: PERSON,
  items: {
    include: {
      purchaseReceiptItem: {
        select: {
          product: { select: { id: true, name: true, unit: true } },
          purchaseReceipt: { select: { id: true, receiptNumber: true } },
        },
      },
    },
  },
  payables: {
    select: {
      id: true,
      amount: true,
      estimatedAmount: true,
      paidAmount: true,
      status: true,
    },
  },
} satisfies Prisma.SupplierInvoiceInclude;

@Injectable()
export class SupplierInvoicesRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Cuentas del proveedor que todavía no tienen factura cargada (ni
  // aprobada ni esperando aprobación), con lo que se recibió en cada una.
  findInvoiceablePayables(
    tenantId: string,
    supplierId: string,
    payableIds?: string[],
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.accountsPayable.findMany({
      where: {
        tenantId,
        supplierId,
        supplierInvoiceId: null,
        status: { not: 'CANCELLED' },
        ...(payableIds ? { id: { in: payableIds } } : {}),
      },
      select: {
        id: true,
        amount: true,
        paidAmount: true,
        status: true,
        purchaseReceipt: RECEIPT_FOR_INVOICE,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  // Una factura rechazada no ocupa el número: se puede volver a cargar.
  findActiveByNumber(
    tenantId: string,
    supplierId: string,
    invoiceNumber: string,
  ) {
    return this.prisma.supplierInvoice.findFirst({
      where: {
        tenantId,
        supplierId,
        invoiceNumber,
        status: { not: 'REJECTED' },
      },
      select: { id: true },
    });
  }

  findById(
    tenantId: string,
    id: string,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.supplierInvoice.findFirst({
      where: { tenantId, id },
      include: WITH_DETAIL,
    });
  }

  create(
    data: Prisma.SupplierInvoiceUncheckedCreateInput,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.supplierInvoice.create({ data, select: { id: true } });
  }

  // Solo engancha las cuentas que siguen sin factura: si otra carga llegó
  // antes, el conteo no cierra y el servicio corta.
  async linkPayables(
    tenantId: string,
    supplierInvoiceId: string,
    payableIds: string[],
    tx: PrismaClientOrTx,
  ) {
    const result = await tx.accountsPayable.updateMany({
      where: { tenantId, id: { in: payableIds }, supplierInvoiceId: null },
      data: { supplierInvoiceId },
    });
    return result.count;
  }

  unlinkPayables(
    tenantId: string,
    supplierInvoiceId: string,
    tx: PrismaClientOrTx,
  ) {
    return tx.accountsPayable.updateMany({
      where: { tenantId, supplierInvoiceId },
      data: { supplierInvoiceId: null },
    });
  }

  // Cambia el estado solo si sigue en el de partida: dos personas no pueden
  // resolver la misma factura.
  async transition(
    tenantId: string,
    id: string,
    from: 'PENDING_APPROVAL',
    data: Prisma.SupplierInvoiceUncheckedUpdateManyInput,
    tx: PrismaClientOrTx,
  ) {
    const result = await tx.supplierInvoice.updateMany({
      where: { tenantId, id, status: from },
      data,
    });
    return result.count;
  }

  // Bloquea las cuentas de la factura y devuelve sus saldos ya dentro de la
  // transacción: un pago simultáneo no puede colarse entre leer y escribir.
  async lockPayables(
    tenantId: string,
    supplierInvoiceId: string,
    tx: PrismaClientOrTx,
  ) {
    await tx.$queryRaw`
      SELECT "id" FROM "accounts_payable"
      WHERE "supplier_invoice_id" = ${supplierInvoiceId}
        AND "tenant_id" = ${tenantId}
      FOR UPDATE
    `;
    return tx.accountsPayable.findMany({
      where: { tenantId, supplierInvoiceId },
      select: {
        id: true,
        amount: true,
        estimatedAmount: true,
        paidAmount: true,
        advanceApplied: true,
      },
    });
  }

  updatePayable(
    tenantId: string,
    id: string,
    data: Prisma.AccountsPayableUncheckedUpdateManyInput,
    tx: PrismaClientOrTx,
  ) {
    return tx.accountsPayable.updateMany({ where: { tenantId, id }, data });
  }
}
