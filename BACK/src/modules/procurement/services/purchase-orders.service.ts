import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../prisma/prisma.service';
import { ProductUnitsRepository } from '../../inventory/repositories/product-units.repository';
import { ProductsRepository } from '../../inventory/repositories/products.repository';
import { PurchaseOrdersRepository } from '../repositories/purchase-orders.repository';
import { CreatePurchaseOrderDto } from '../dto/create-purchase-order.dto';
import { ReceiveItemsDto } from '../dto/receive-items.dto';

@Injectable()
export class PurchaseOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly purchaseOrdersRepository: PurchaseOrdersRepository,
    private readonly productsRepository: ProductsRepository,
    private readonly productUnitsRepository: ProductUnitsRepository,
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

      return order;
    });
  }

  async confirm(tenantId: string, id: string) {
    const order = await this.findOne(tenantId, id);
    if (order.status !== 'PENDING') {
      throw new UnprocessableEntityException(
        'Only PENDING orders can be confirmed',
      );
    }
    await this.purchaseOrdersRepository.updateStatus(tenantId, id, 'CONFIRMED');
    return this.purchaseOrdersRepository.findById(tenantId, id);
  }

  async receive(tenantId: string, id: string, dto: ReceiveItemsDto) {
    const order = await this.findOne(tenantId, id);
    if (!['CONFIRMED', 'PARTIALLY_RECEIVED'].includes(order.status)) {
      throw new UnprocessableEntityException(
        'Order must be CONFIRMED to receive items',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      for (const received of dto.items) {
        const item = await this.purchaseOrdersRepository.findItem(
          received.itemId,
        );
        if (!item || item.purchaseOrder.tenantId !== tenantId) {
          throw new NotFoundException(`Item ${received.itemId} not found`);
        }

        const product = await this.productsRepository.findById(
          tenantId,
          item.productId,
        );
        if (!product) throw new NotFoundException('Product not found');

        if (product.isSerialized) {
          const serials = received.serialNumbers ?? [];
          if (serials.length === 0) {
            throw new UnprocessableEntityException(
              `Serial numbers required for serialized product ${product.name}`,
            );
          }
          await this.productUnitsRepository.createMany(
            tenantId,
            item.productId,
            serials,
            item.id,
            tx,
          );
          await this.purchaseOrdersRepository.updateItemReceivedQty(
            item.id,
            item.receivedQty + serials.length,
            tx,
          );
        } else {
          const qty = item.quantity - item.receivedQty;
          await tx.stockMovement.create({
            data: {
              tenantId,
              productId: item.productId,
              type: 'IN',
              quantity: qty,
              referenceId: item.id,
            },
          });
          await this.purchaseOrdersRepository.updateItemReceivedQty(
            item.id,
            item.quantity,
            tx,
          );
        }
      }

      const updated = await this.purchaseOrdersRepository.findById(
        tenantId,
        id,
      );
      const allReceived = updated!.items.every(
        (i) => i.receivedQty >= i.quantity,
      );
      await this.purchaseOrdersRepository.updateStatus(
        tenantId,
        id,
        allReceived ? 'RECEIVED' : 'PARTIALLY_RECEIVED',
        tx,
      );
    });

    const final = await this.purchaseOrdersRepository.findById(tenantId, id);
    this.eventEmitter.emit('purchase.order.received', {
      tenantId,
      purchaseOrderId: id,
    });
    return final;
  }
}
