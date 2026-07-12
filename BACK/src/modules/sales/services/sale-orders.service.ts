import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../prisma/prisma.service';
import { ProductsRepository } from '../../inventory/repositories/products.repository';
import { CreateSaleOrderDto } from '../dto/create-sale-order.dto';
import { SaleOrdersRepository } from '../repositories/sale-orders.repository';
import type { AuditLogEvent } from '../../../audit/audit-log.event';

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
    // Atomic transition: only succeeds if current status is PENDING_CREDIT_APPROVAL.
    // Eliminates TOCTOU race between two concurrent approve calls.
    const result = await this.prisma.saleOrder.updateMany({
      where: { id, tenantId, status: 'PENDING_CREDIT_APPROVAL' },
      data: { status: 'CREDIT_APPROVED', approvedById: userId ?? null, approvedAt: new Date() },
    });
    if (result.count === 0) {
      throw new UnprocessableEntityException(
        'Solo los pedidos en espera de aprobación de crédito pueden aprobarse',
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
    const productIds = dto.items.map((i) => i.productId);
    const products = await this.productsRepository.findManyByIds(tenantId, productIds);
    const productMap = new Map(products.map((p) => [p.id, p]));

    // Quotes never block stock and don't need credit approval yet
    let initialStatus: 'QUOTED' | 'PENDING' | 'PENDING_CREDIT_APPROVAL';
    if (isQuote) {
      initialStatus = 'QUOTED';
    } else if (isCreditSale) {
      initialStatus = 'PENDING_CREDIT_APPROVAL';
    } else {
      initialStatus = 'PENDING';
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
          orderDate: new Date(),
          notes: dto.notes,
          status: initialStatus,
          surchargeType: dto.surchargeType ?? null,
          surchargeAmount: dto.surchargeAmount ?? null,
          surchargeReason: dto.surchargeReason ?? null,
        },
      });

      for (const item of dto.items) {
        const product = productMap.get(item.productId);
        if (!product) throw new NotFoundException(`Product ${item.productId} not found`);

        if (product.isSerialized) {
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
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            warehouseId: item.warehouseId ?? null,
          },
        });

        if (product.isSerialized && (item.serialNumbers?.length ?? 0) > 0) {
          for (const serial of item.serialNumbers!) {
            const unit = await tx.productUnit.findFirst({
              where: { tenantId, productId: item.productId, serialNumber: serial },
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

  async confirm(tenantId: string, id: string, userId?: string) {
    // Atomic status transition — prevents TOCTOU race between two concurrent confirm calls.
    // If the order is not in an approvable state, updateMany returns count=0.
    const transitioned = await this.prisma.saleOrder.updateMany({
      where: { id, tenantId, status: { in: ['PENDING', 'CREDIT_APPROVED'] } },
      data: { status: 'CONFIRMED' },
    });
    if (transitioned.count === 0) {
      throw new UnprocessableEntityException(
        'Only PENDING or CREDIT_APPROVED orders can be confirmed',
      );
    }

    // Batch-fetch all products in a single query — avoids N+1 inside the loop.
    const order = await this.findOne(tenantId, id);
    const productIds = order.items.map((i) => i.productId);
    const products = await this.productsRepository.findManyByIds(tenantId, productIds);
    const productMap = new Map(products.map((p) => [p.id, p]));

    await this.prisma.$transaction(async (tx) => {
      for (const item of order.items) {
        const product = productMap.get(item.productId);
        if (!product) throw new NotFoundException(`Product ${item.productId} not found`);

        if (product.isSerialized) {
          const units = await tx.productUnit.findMany({
            where: { saleOrderItemId: item.id, tenantId },
          });

          if (units.length === 0) {
            throw new UnprocessableEntityException(
              `No serial units linked to sale item for product "${product.name}". Re-create the order specifying serial numbers.`,
            );
          }

          for (const unit of units) {
            if (unit.status !== 'IN_STOCK') {
              throw new UnprocessableEntityException(
                `Unit ${unit.serialNumber} is not available (status: ${unit.status})`,
              );
            }
            await tx.productUnit.update({
              where: { id: unit.id },
              data: { status: 'SOLD' },
            });
            await tx.stockMovement.create({
              data: {
                tenantId,
                productId: item.productId,
                warehouseId: item.warehouseId ?? null,
                type: 'OUT',
                quantity: -1,
                referenceId: item.id,
              },
            });
          }
        } else {
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
        }
      }
    });

    const confirmed = await this.saleOrdersRepository.findById(tenantId, id);
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

  async deliver(tenantId: string, id: string, userId?: string) {
    // Atomic transition: CONFIRMED → DELIVERED
    const result = await this.prisma.saleOrder.updateMany({
      where: { id, tenantId, status: 'CONFIRMED' },
      data: { status: 'DELIVERED' },
    });
    if (result.count === 0) {
      throw new UnprocessableEntityException(
        'Solo los pedidos CONFIRMED pueden marcarse como entregados',
      );
    }
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
    if (order.status === 'CONFIRMED' || order.status === 'DELIVERED') {
      throw new UnprocessableEntityException(
        'Confirmed or delivered orders cannot be cancelled. Use a credit note instead.',
      );
    }
    const cancelled = await this.prisma.saleOrder.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'sales',
      action: 'sale.order.cancelled',
      resourceId: id,
    } satisfies AuditLogEvent);
    return cancelled;
  }
}
