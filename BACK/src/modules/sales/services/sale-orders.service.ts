import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../prisma/prisma.service';
import { ProductUnitsRepository } from '../../inventory/repositories/product-units.repository';
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
    private readonly productUnitsRepository: ProductUnitsRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  findAll(tenantId: string) {
    return this.saleOrdersRepository.findAll(tenantId);
  }

  async findOne(tenantId: string, id: string) {
    const order = await this.saleOrdersRepository.findById(tenantId, id);
    if (!order) throw new NotFoundException('Sale order not found');
    return order;
  }

  async create(tenantId: string, dto: CreateSaleOrderDto, userId?: string) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.saleOrder.create({
        data: {
          tenantId,
          customerId: dto.customerId,
          orderDate: new Date(),
          notes: dto.notes,
          status: 'PENDING',
        },
      });

      for (const item of dto.items) {
        const product = await this.productsRepository.findById(
          tenantId,
          item.productId,
        );
        if (!product)
          throw new NotFoundException(`Product ${item.productId} not found`);

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
          },
        });

        if (product.isSerialized && (item.serialNumbers?.length ?? 0) > 0) {
          for (const serial of item.serialNumbers!) {
            const unit = await tx.productUnit.findFirst({
              where: {
                tenantId,
                productId: item.productId,
                serialNumber: serial,
              },
            });
            if (!unit) {
              throw new NotFoundException(
                `Serial number "${serial}" not found`,
              );
            }
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

  async confirm(tenantId: string, id: string, userId?: string) {
    const order = await this.findOne(tenantId, id);
    if (order.status !== 'PENDING') {
      throw new UnprocessableEntityException(
        'Only PENDING orders can be confirmed',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      for (const item of order.items) {
        const product = await this.productsRepository.findById(
          tenantId,
          item.productId,
        );
        if (!product)
          throw new NotFoundException(`Product ${item.productId} not found`);

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
                type: 'OUT',
                quantity: 1,
                referenceId: item.id,
              },
            });
          }
        } else {
          await tx.stockMovement.create({
            data: {
              tenantId,
              productId: item.productId,
              type: 'OUT',
              quantity: item.quantity,
              referenceId: item.id,
            },
          });
        }
      }

      await tx.saleOrder.update({
        where: { id },
        data: { status: 'CONFIRMED' },
      });
    });

    const confirmed = await this.saleOrdersRepository.findById(tenantId, id);
    this.eventEmitter.emit('sale.order.completed', {
      tenantId,
      saleOrderId: id,
      order: confirmed,
    });
    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'sales',
      action: 'sale.order.confirmed',
      resourceId: id,
    } satisfies AuditLogEvent);
    return confirmed;
  }

  async cancel(tenantId: string, id: string, userId?: string) {
    const order = await this.findOne(tenantId, id);
    if (order.status === 'CONFIRMED') {
      throw new UnprocessableEntityException(
        'Confirmed orders cannot be cancelled. Use a credit note instead.',
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
