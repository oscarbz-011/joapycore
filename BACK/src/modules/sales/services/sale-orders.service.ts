import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../prisma/prisma.service';
import { ProductsRepository } from '../../inventory/repositories/products.repository';
import { CollectPaymentDto } from '../dto/collect-payment.dto';
import { CreateSaleOrderDto } from '../dto/create-sale-order.dto';
import { RegisterDownPaymentDto } from '../dto/register-down-payment.dto';
import { SaleOrdersRepository } from '../repositories/sale-orders.repository';
import type { AuditLogEvent } from '../../../audit/audit-log.event';

function toNum(value: unknown): number {
  if (typeof value === 'object' && value !== null && 'toNumber' in value) {
    return (value as { toNumber(): number }).toNumber();
  }
  return Number(value);
}

@Injectable()
export class SaleOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly saleOrdersRepository: SaleOrdersRepository,
    private readonly productsRepository: ProductsRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  findAll(tenantId: string, sellerId?: string) {
    return this.saleOrdersRepository.findAll(tenantId, sellerId);
  }

  findPendingApprovals(tenantId: string) {
    return this.saleOrdersRepository.findPendingApprovals(tenantId);
  }

  async approveCredit(tenantId: string, id: string, userId?: string) {
    // Business rule checks before the atomic transition
    const order = await this.saleOrdersRepository.findById(tenantId, id);
    if (!order) throw new NotFoundException('Pedido no encontrado');
    if (order.status !== 'PENDING_CREDIT_APPROVAL') {
      throw new UnprocessableEntityException(
        'Solo los pedidos en espera de aprobación de crédito pueden aprobarse',
      );
    }

    // Check for overdue installments (morosidad)
    const overdueCount = await this.prisma.installment.count({
      where: {
        tenantId,
        status: 'OVERDUE',
        loan: { customerId: order.customerId },
      },
    });
    if (overdueCount > 0) {
      throw new UnprocessableEntityException(
        `El cliente tiene ${overdueCount} cuota(s) vencida(s). Regularice la situación antes de aprobar un nuevo crédito.`,
      );
    }

    // Check credit limit
    const customer = await this.prisma.customer.findFirst({
      where: { id: order.customerId, tenantId },
      select: { creditLimit: true },
    });
    if (customer?.creditLimit) {
      const activeDebt = await this.prisma.loan.aggregate({
        where: { tenantId, customerId: order.customerId, status: 'ACTIVE' },
        _sum: { totalAmount: true },
      });
      const currentDebt = toNum(activeDebt._sum.totalAmount ?? 0);
      const orderTotal = (order.items as Array<{ unitPrice: unknown; quantity: number }>).reduce(
        (sum, i) => sum + toNum(i.unitPrice) * i.quantity,
        0,
      );
      const limit = toNum(customer.creditLimit);
      if (currentDebt + orderTotal > limit) {
        throw new UnprocessableEntityException(
          `El cliente supera su límite de crédito (${limit}). Deuda activa: ${currentDebt}, pedido: ${orderTotal}.`,
        );
      }
    }

    // Atomic transition — TOCTOU-safe because status is the guard
    const result = await this.prisma.saleOrder.updateMany({
      where: { id, tenantId, status: 'PENDING_CREDIT_APPROVAL' },
      data: { status: 'CREDIT_APPROVED', approvedById: userId ?? null, approvedAt: new Date() },
    });
    if (result.count === 0) {
      throw new UnprocessableEntityException(
        'El pedido fue modificado por otra operación concurrente. Por favor, recargue e intente de nuevo.',
      );
    }

    // Triggers Loan + Installment creation in FinanceModule via event
    this.eventEmitter.emit('sale.credit.approved', { tenantId, saleOrderId: id });
    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'sales',
      action: 'sale.credit.approved',
      resourceId: id,
    } satisfies AuditLogEvent);
    return this.saleOrdersRepository.findById(tenantId, id);
  }

  async registerDownPayment(
    tenantId: string,
    id: string,
    dto: RegisterDownPaymentDto,
    userId?: string,
  ) {
    const order = await this.findOne(tenantId, id);
    if (order.status !== 'CREDIT_APPROVED') {
      throw new UnprocessableEntityException(
        'Solo se puede registrar el pie (entrega inicial) en pedidos con crédito aprobado',
      );
    }

    const existing = await this.prisma.downPayment.findUnique({ where: { saleOrderId: id } });
    if (existing) {
      throw new ConflictException('Ya existe un pie registrado para este pedido');
    }

    const downPayment = await this.prisma.downPayment.create({
      data: {
        tenantId,
        saleOrderId: id,
        amount: dto.amount,
        paymentMethod: dto.paymentMethod,
        paymentDate: new Date(dto.paymentDate),
        reference: dto.reference ?? null,
        notes: dto.notes ?? null,
        registeredById: userId ?? null,
      },
    });

    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'sales',
      action: 'sale.down-payment.registered',
      resourceId: id,
      after: { downPaymentId: downPayment.id, amount: dto.amount },
    } satisfies AuditLogEvent);

    return downPayment;
  }

  async rejectCredit(
    tenantId: string,
    id: string,
    reason: string,
    userId?: string,
  ) {
    // Atomic transition: only succeeds if current status is PENDING_CREDIT_APPROVAL.
    const result = await this.prisma.saleOrder.updateMany({
      where: { id, tenantId, status: 'PENDING_CREDIT_APPROVAL' },
      data: {
        status: 'CREDIT_REJECTED',
        rejectedById: userId ?? null,
        rejectedAt: new Date(),
        rejectionReason: reason,
      },
    });
    if (result.count === 0) {
      throw new UnprocessableEntityException(
        'Solo los pedidos en espera de aprobación de crédito pueden rechazarse',
      );
    }
    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'sales',
      action: 'sale.credit.rejected',
      resourceId: id,
    } satisfies AuditLogEvent);
    return this.saleOrdersRepository.findById(tenantId, id);
  }

  async findOne(tenantId: string, id: string) {
    const order = await this.saleOrdersRepository.findById(tenantId, id);
    if (!order) throw new NotFoundException('Sale order not found');
    return order;
  }

  async create(
    tenantId: string,
    dto: CreateSaleOrderDto,
    userId?: string,
    canManage = false,
  ) {
    const effectiveSellerId = canManage && dto.sellerId ? dto.sellerId : (userId ?? null);
    const isQuote = dto.orderType === 'QUOTE';
    const isCreditSale = dto.saleType === 'CREDIT';

    // Batch-fetch all products in a single query — avoids N+1 inside the loop.
    const productIds = dto.items.map((i) => i.productId).filter((id): id is string => !!id);
    const products = await this.productsRepository.findManyByIds(tenantId, productIds);
    const productMap = new Map(products.map((p) => [p.id, p]));

    // Validate free-text items have a description
    for (const item of dto.items) {
      if (!item.productId && !item.description) {
        throw new UnprocessableEntityException(
          'Los ítems sin producto deben tener una descripción',
        );
      }
    }

    // Compute denormalized totals (subtotal = items; total = subtotal ± surcharge)
    const subtotal = dto.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
    let total = subtotal;
    if (dto.surchargeAmount) {
      total = dto.surchargeType === 'FIXED'
        ? subtotal + dto.surchargeAmount
        : subtotal * (1 + dto.surchargeAmount / 100);
    }

    // Quotes never block stock and don't need credit approval yet
    let initialStatus: 'QUOTED' | 'PENDING' | 'PENDING_CREDIT_APPROVAL';
    if (isQuote) {
      initialStatus = 'QUOTED';
    } else if (isCreditSale) {
      initialStatus = 'PENDING_CREDIT_APPROVAL';
    } else {
      initialStatus = 'PENDING';
    }

    // For credit sales, resolve the interest rate from the tenant's active CreditPlan
    // before opening the transaction to fail fast with a clear error.
    let creditInterestRate: number | null = null;
    if (isCreditSale) {
      if (!dto.installments) {
        throw new UnprocessableEntityException(
          'Las ventas a crédito requieren especificar el número de cuotas',
        );
      }
      const plan = await this.prisma.creditPlan.findFirst({
        where: {
          creditConfig: { tenantId },
          installments: dto.installments,
          isActive: true,
        },
      });
      if (!plan) {
        throw new UnprocessableEntityException(
          `No hay un plan de crédito activo para ${dto.installments} cuotas. Configurá los planes en Ajustes → Créditos.`,
        );
      }
      creditInterestRate =
        typeof plan.interestRate === 'object'
          ? (plan.interestRate as { toNumber(): number }).toNumber()
          : Number(plan.interestRate);
    }

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.saleOrder.create({
        data: {
          tenantId,
          customerId: dto.customerId,
          createdById: userId ?? null,
          sellerId: effectiveSellerId,
          orderType: dto.orderType ?? 'STANDARD',
          saleType: dto.saleType ?? 'CASH',
          installments: isCreditSale ? (dto.installments ?? null) : null,
          interestRate: creditInterestRate,
          orderDate: new Date(),
          notes: dto.notes,
          status: initialStatus,
          surchargeType: dto.surchargeType ?? null,
          surchargeAmount: dto.surchargeAmount ?? null,
          surchargeReason: dto.surchargeReason ?? null,
          subtotal: Math.round(subtotal * 100) / 100,
          total: Math.round(total * 100) / 100,
        },
      });

      for (const item of dto.items) {
        const product = item.productId ? productMap.get(item.productId) : null;
        if (item.productId && !product) {
          throw new NotFoundException(`Product ${item.productId} not found`);
        }

        if (product?.isSerialized) {
          const serials = item.serialNumbers ?? [];
          if (serials.length !== item.quantity) {
            throw new UnprocessableEntityException(
              `Product "${product.name}" is serialized — provide exactly ${item.quantity} serial number(s)`,
            );
          }
        }

        const saleItem = await tx.saleOrderItem.create({
          data: {
            saleOrderId: order.id,
            productId: item.productId ?? null,
            description: item.description ?? null,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            warehouseId: item.warehouseId ?? null,
          },
        });

        if (product?.isSerialized && (item.serialNumbers?.length ?? 0) > 0) {
          for (const serial of item.serialNumbers!) {
            const unit = await tx.productUnit.findFirst({
              where: { tenantId, productId: item.productId!, serialNumber: serial },
            });
            if (!unit) throw new NotFoundException(`Serial number "${serial}" not found`);
            if (unit.status !== 'IN_STOCK') {
              throw new UnprocessableEntityException(
                `Serial "${serial}" is not available (status: ${unit.status})`,
              );
            }
            await tx.productUnit.update({
              where: { id: unit.id },
              data: { saleOrderItemId: saleItem.id },
            });
          }
        }

        // For non-QUOTE cash orders, reserve stock immediately so it's visible as committed
        // Only applicable for product-linked items (not free-text service lines)
        if (!isQuote && !isCreditSale && item.productId) {
          await tx.stockMovement.create({
            data: {
              tenantId,
              productId: item.productId,
              warehouseId: item.warehouseId ?? null,
              type: 'RESERVED',
              quantity: -item.quantity,
              referenceId: saleItem.id,
            },
          });
        }
      }

      const created = await tx.saleOrder.findUnique({
        where: { id: order.id },
        include: { customer: true, items: { include: { product: true } } },
      });
      this.eventEmitter.emit('audit.log', {
        tenantId,
        userId,
        module: 'sales',
        action: 'sale.order.created',
        resourceId: order.id,
        after: created,
      } satisfies AuditLogEvent);
      return created;
    });
  }

  async convertQuoteToOrder(tenantId: string, id: string, userId?: string) {
    // Quotes become real orders: QUOTED → PENDING (cash) or PENDING_CREDIT_APPROVAL (credit)
    const order = await this.findOne(tenantId, id);
    if (order.status !== 'QUOTED') {
      throw new UnprocessableEntityException(
        'Solo los presupuestos en estado QUOTED pueden convertirse en pedido',
      );
    }
    const isCreditSale = order.saleType === 'CREDIT';
    const nextStatus = isCreditSale ? 'PENDING_CREDIT_APPROVAL' : 'PENDING';

    const updated = await this.prisma.saleOrder.update({
      where: { id },
      data: { status: nextStatus, orderType: 'STANDARD' },
    });
    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'sales',
      action: 'sale.quote.converted',
      resourceId: id,
    } satisfies AuditLogEvent);
    return updated;
  }

  // Cash sales Phase 3: collect payment → PAYMENT_RECEIVED + invoice trigger
  async collectPayment(
    tenantId: string,
    id: string,
    dto: CollectPaymentDto,
    userId?: string,
  ) {
    const transitioned = await this.prisma.saleOrder.updateMany({
      where: { id, tenantId, status: 'PENDING', saleType: 'CASH' },
      data: { status: 'PAYMENT_RECEIVED' },
    });
    if (transitioned.count === 0) {
      throw new UnprocessableEntityException(
        'Solo pedidos contado en estado PENDIENTE pueden registrar cobro',
      );
    }

    await this.prisma.salePayment.createMany({
      data: dto.payments.map((p) => ({
        tenantId,
        saleOrderId: id,
        amount: p.amount,
        paymentMethod: p.paymentMethod,
        paymentDate: new Date(p.paymentDate),
        reference: p.reference ?? null,
        notes: p.notes ?? null,
        collectedById: userId ?? null,
      })),
    });

    const order = await this.saleOrdersRepository.findById(tenantId, id);
    // Triggers invoice creation in billing module for cash sales
    this.eventEmitter.emit('sale.payment.collected', {
      tenantId,
      saleOrderId: id,
      order,
    });
    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'sales',
      action: 'sale.payment.collected',
      resourceId: id,
      after: { payments: dto.payments },
    } satisfies AuditLogEvent);
    return order;
  }

  // Both cash (PENDING) and credit (CREDIT_APPROVED) → CONFIRMED.
  // sale.order.completed triggers billing to create the invoice for both flows.
  async confirm(tenantId: string, id: string, userId?: string) {
    const transitioned = await this.prisma.saleOrder.updateMany({
      where: { id, tenantId, status: { in: ['PENDING', 'CREDIT_APPROVED'] } },
      data: { status: 'CONFIRMED' },
    });
    if (transitioned.count === 0) {
      throw new UnprocessableEntityException(
        'El pedido no puede confirmarse en su estado actual',
      );
    }

    const confirmed = await this.saleOrdersRepository.findById(tenantId, id);

    // Create delivery note in PENDING state so logistics can pick it up.
    // Upsert guards against re-confirming an order that already has a note.
    await this.prisma.deliveryNote.upsert({
      where: { saleOrderId: id },
      create: { tenantId, saleOrderId: id, status: 'PENDING', issuedAt: new Date() },
      update: {},
    });

    // Invoice is created by BillingOnSaleListener on this event
    this.eventEmitter.emit('sale.order.completed', { tenantId, saleOrderId: id, order: confirmed });
    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'sales',
      action: 'sale.order.confirmed',
      resourceId: id,
    } satisfies AuditLogEvent);
    return confirmed;
  }

  // Called by SalesOnDeliveryListener when logistics confirms delivery
  async handleDeliveryConfirmed(tenantId: string, saleOrderId: string, userId?: string) {
    await this.prisma.saleOrder.updateMany({
      where: { id: saleOrderId, tenantId, status: { in: ['CONFIRMED', 'INVOICED', 'PAYMENT_RECEIVED'] } },
      data: { status: 'DELIVERED' },
    });

    const order = await this.findOne(tenantId, saleOrderId);
    const isCashOrder = order.saleType === 'CASH';

    await this.prisma.$transaction(async (tx) => {
      for (const item of order.items) {
        if (!item.productId) continue; // free-text / service lines have no stock
        if (isCashOrder) {
          await tx.stockMovement.create({
            data: {
              tenantId,
              productId: item.productId,
              warehouseId: item.warehouseId ?? null,
              type: 'RESERVED',
              quantity: item.quantity,
              referenceId: item.id,
            },
          });
        }
        await tx.stockMovement.create({
          data: {
            tenantId,
            productId: item.productId,
            warehouseId: item.warehouseId ?? null,
            type: 'OUT',
            quantity: -item.quantity,
            referenceId: item.id,
          },
        });
        if (item.product?.isSerialized) {
          const units = await tx.productUnit.findMany({
            where: { saleOrderItemId: item.id, tenantId },
          });
          for (const unit of units) {
            await tx.productUnit.update({ where: { id: unit.id }, data: { status: 'SOLD' } });
          }
        }
      }
    });

    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'sales',
      action: 'sale.order.delivered',
      resourceId: saleOrderId,
    } satisfies AuditLogEvent);
  }

  async deliver(tenantId: string, id: string, userId?: string) {
    const result = await this.prisma.saleOrder.updateMany({
      where: {
        id,
        tenantId,
        status: { in: ['CONFIRMED', 'PAYMENT_RECEIVED'] },
      },
      data: { status: 'DELIVERED' },
    });
    if (result.count === 0) {
      throw new UnprocessableEntityException(
        'Solo los pedidos confirmados pueden marcarse como entregados',
      );
    }

    const order = await this.findOne(tenantId, id);
    const isCashOrder = order.saleType === 'CASH';

    await this.prisma.$transaction(async (tx) => {
      for (const item of order.items) {
        if (!item.productId) continue; // free-text / service lines have no stock

        if (isCashOrder) {
          // Cash only: release the RESERVED movement created at order creation
          await tx.stockMovement.create({
            data: {
              tenantId,
              productId: item.productId,
              warehouseId: item.warehouseId ?? null,
              type: 'RESERVED',
              quantity: item.quantity, // positive = reverses the reservation
              referenceId: item.id,
            },
          });
        }

        // All orders (cash + credit): create the real OUT movement
        await tx.stockMovement.create({
          data: {
            tenantId,
            productId: item.productId,
            warehouseId: item.warehouseId ?? null,
            type: 'OUT',
            quantity: -item.quantity,
            referenceId: item.id,
          },
        });

        // All orders: mark serialized units as SOLD
        if (item.product?.isSerialized) {
          const units = await tx.productUnit.findMany({
            where: { saleOrderItemId: item.id, tenantId },
          });
          for (const unit of units) {
            await tx.productUnit.update({
              where: { id: unit.id },
              data: { status: 'SOLD' },
            });
          }
        }
      }
    });

    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'sales',
      action: 'sale.order.delivered',
      resourceId: id,
    } satisfies AuditLogEvent);
    return this.saleOrdersRepository.findById(tenantId, id);
  }

  async cancel(tenantId: string, id: string, userId?: string) {
    const order = await this.findOne(tenantId, id);
    if (['CONFIRMED', 'PAYMENT_RECEIVED', 'DELIVERED'].includes(order.status)) {
      throw new UnprocessableEntityException(
        'Los pedidos confirmados o entregados no pueden cancelarse. Emitir una nota de crédito.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.saleOrder.update({ where: { id }, data: { status: 'CANCELLED' } });

      // Release stock reservations for cancelled cash orders
      if (order.saleType === 'CASH' && order.status === 'PENDING') {
        for (const item of order.items) {
          if (!item.productId) continue;
          await tx.stockMovement.create({
            data: {
              tenantId,
              productId: item.productId,
              warehouseId: item.warehouseId ?? null,
              type: 'RESERVED',
              quantity: item.quantity, // positive = reverses the reservation
              referenceId: item.id,
            },
          });
        }
      }
    });

    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'sales',
      action: 'sale.order.cancelled',
      resourceId: id,
    } satisfies AuditLogEvent);
    return this.saleOrdersRepository.findById(tenantId, id);
  }
}
