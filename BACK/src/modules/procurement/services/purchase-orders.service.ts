import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../prisma/prisma.service';
import { PurchaseOrdersRepository } from '../repositories/purchase-orders.repository';
import { CreatePurchaseOrderDto } from '../dto/create-purchase-order.dto';
import type { AuditLogEvent } from '../../../audit/audit-log.event';

@Injectable()
export class PurchaseOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly purchaseOrdersRepository: PurchaseOrdersRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  findAll(tenantId: string) {
    return this.purchaseOrdersRepository.findAll(tenantId);
  }

  async findOne(tenantId: string, id: string) {
    const order = await this.purchaseOrdersRepository.findById(tenantId, id);
    if (!order) throw new NotFoundException('Purchase order not found');
    return order;
  }

  async create(tenantId: string, userId: string, dto: CreatePurchaseOrderDto) {
    return this.prisma.$transaction(async (tx) => {
      const order = await this.purchaseOrdersRepository.create(
        tenantId,
        {
          supplierId: dto.supplierId,
          purchaseType: dto.purchaseType,
          status: 'PENDING',
          orderDate: new Date(dto.orderDate),
          expectedDate: dto.expectedDate
            ? new Date(dto.expectedDate)
            : undefined,
          exchangeRate: dto.exchangeRate,
          customsDuty: dto.customsDuty,
          customsRef: dto.customsRef,
          notes: dto.notes,
        },
        tx,
      );

      for (const item of dto.items) {
        await this.purchaseOrdersRepository.createItem(
          {
            purchaseOrderId: order.id,
            productId: item.productId,
            quantity: item.quantity,
            unitCost: item.unitCost,
          },
          tx,
        );
      }

      this.eventEmitter.emit('audit.log', {
        tenantId,
        userId,
        module: 'procurement',
        action: 'purchase.order.created',
        resourceId: order.id,
      } satisfies AuditLogEvent);
      return order;
    });
  }

  async confirm(tenantId: string, id: string, userId?: string) {
    const order = await this.findOne(tenantId, id);
    if (order.status !== 'PENDING') {
      throw new UnprocessableEntityException(
        'Only PENDING orders can be confirmed',
      );
    }
    await this.purchaseOrdersRepository.updateStatus(tenantId, id, 'CONFIRMED');
    this.eventEmitter.emit('purchase.order.confirmed', {
      tenantId,
      purchaseOrderId: id,
    });
    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'procurement',
      action: 'purchase.order.confirmed',
      resourceId: id,
    } satisfies AuditLogEvent);
    return this.purchaseOrdersRepository.findById(tenantId, id);
  }
}
