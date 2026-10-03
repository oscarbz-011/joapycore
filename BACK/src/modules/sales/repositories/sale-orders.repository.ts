import { Injectable } from '@nestjs/common';
import { Prisma, OrderType } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaClientOrTx } from '../../../prisma/types';

@Injectable()
export class SaleOrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get include() {
    const userSelect = {
      select: { id: true, firstName: true, lastName: true },
    };
    return {
      customer: true,
      items: { include: { product: true, productUnits: true, batch: true } },
      createdBy: userSelect,
      seller: userSelect,
      approvedBy: userSelect,
      rejectedBy: userSelect,
      invoice: { select: { id: true, status: true } },
      loan: { select: { totalAmount: true, interestRate: true } },
      salePayments: { orderBy: { paymentDate: 'asc' as const } },
      guarantors: { orderBy: { createdAt: 'asc' as const } },
    };
  }

  findPendingApprovals(tenantId: string) {
    return this.prisma.saleOrder.findMany({
      where: { tenantId, status: 'PENDING_CREDIT_APPROVAL' },
      include: this.include,
      orderBy: { createdAt: 'desc' },
    });
  }

  findAll(tenantId: string, sellerId?: string, orderType?: OrderType) {
    return this.prisma.saleOrder.findMany({
      where: {
        tenantId,
        ...(orderType ? { orderType } : {}),
        ...(sellerId
          ? { OR: [{ sellerId }, { sellerId: null, createdById: sellerId }] }
          : {}),
      },
      include: this.include,
      orderBy: { createdAt: 'desc' },
    });
  }

  findById(tenantId: string, id: string) {
    return this.prisma.saleOrder.findFirst({
      where: { id, tenantId },
      include: this.include,
    });
  }

  findLastQuoteNumber(tenantId: string) {
    return this.prisma.saleOrder.findFirst({
      where: { tenantId, quoteNumber: { startsWith: 'PRES-' } },
      orderBy: { quoteNumber: 'desc' },
      select: { quoteNumber: true },
    });
  }

  create(
    data: Prisma.SaleOrderUncheckedCreateInput,
    client?: PrismaClientOrTx,
  ) {
    const db = client ?? this.prisma;
    return db.saleOrder.create({ data, include: this.include });
  }

  createItem(
    data: Prisma.SaleOrderItemUncheckedCreateInput,
    client?: PrismaClientOrTx,
  ) {
    const db = client ?? this.prisma;
    return db.saleOrderItem.create({ data });
  }

  // Transición de estado protegida: solo actualiza si el pedido cumple el
  // guard (p.ej. su estado actual). Devuelve { count } para detectar
  // carreras.
  transition(
    tenantId: string,
    id: string,
    guard: Prisma.SaleOrderWhereInput,
    data: Prisma.SaleOrderUncheckedUpdateManyInput,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.saleOrder.updateMany({
      where: { id, tenantId, ...guard },
      data,
    });
  }

  updateById(
    id: string,
    data: Prisma.SaleOrderUncheckedUpdateInput,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.saleOrder.update({ where: { id }, data });
  }

  // Alta sin relaciones: los ítems se crean después en la misma transacción.
  createBare(
    data: Prisma.SaleOrderUncheckedCreateInput,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.saleOrder.create({ data });
  }

  findWithItems(id: string, client: PrismaClientOrTx = this.prisma) {
    return client.saleOrder.findUnique({
      where: { id },
      include: { customer: true, items: { include: { product: true } } },
    });
  }

  findWithItemsOrThrow(id: string, client: PrismaClientOrTx = this.prisma) {
    return client.saleOrder.findUniqueOrThrow({
      where: { id },
      include: { customer: true, items: { include: { product: true } } },
    });
  }

  // ── Ítems ──────────────────────────────────────────────────────────────────

  deleteItems(saleOrderId: string, client: PrismaClientOrTx = this.prisma) {
    return client.saleOrderItem.deleteMany({ where: { saleOrderId } });
  }

  updateItem(
    id: string,
    data: Prisma.SaleOrderItemUncheckedUpdateInput,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.saleOrderItem.update({ where: { id }, data });
  }

  findProductItems(
    saleOrderId: string,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.saleOrderItem.findMany({
      where: { saleOrderId, productId: { not: null } },
      include: { product: { select: { name: true, isSerialized: true } } },
    });
  }

  // ── Cobros y pie ───────────────────────────────────────────────────────────

  createPayments(
    data: Prisma.SalePaymentCreateManyInput[],
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.salePayment.createMany({ data });
  }

  findDownPayment(saleOrderId: string) {
    return this.prisma.downPayment.findUnique({ where: { saleOrderId } });
  }

  createDownPayment(data: Prisma.DownPaymentUncheckedCreateInput) {
    return this.prisma.downPayment.create({ data });
  }

  // Solo avanza si el pedido sigue CONFIRMED (idempotente ante reintentos).
  markInvoiced(tenantId: string, id: string) {
    return this.prisma.saleOrder.updateMany({
      where: { id, tenantId, status: 'CONFIRMED' },
      data: { status: 'INVOICED' },
    });
  }

  updateStatus(id: string, status: string, client?: PrismaClientOrTx) {
    const db = client ?? this.prisma;
    return db.saleOrder.update({
      where: { id },
      data: { status: status as never },
    });
  }
}
