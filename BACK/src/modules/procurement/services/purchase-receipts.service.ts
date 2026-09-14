import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../prisma/prisma.service';
import { PurchaseOrdersRepository } from '../repositories/purchase-orders.repository';
import { PurchaseReceiptsRepository } from '../repositories/purchase-receipts.repository';
import { CreatePurchaseReceiptDto } from '../dto/create-purchase-receipt.dto';
import type { AuditLogEvent } from '../../../audit/audit-log.event';

@Injectable()
export class PurchaseReceiptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly purchaseOrdersRepository: PurchaseOrdersRepository,
    private readonly purchaseReceiptsRepository: PurchaseReceiptsRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  findByOrder(tenantId: string, orderId: string) {
    return this.purchaseReceiptsRepository.findByOrder(tenantId, orderId);
  }

  async findOne(tenantId: string, id: string) {
    const receipt = await this.purchaseReceiptsRepository.findById(
      tenantId,
      id,
    );
    if (!receipt) throw new NotFoundException('Purchase receipt not found');
    return receipt;
  }

  async create(
    tenantId: string,
    orderId: string,
    dto: CreatePurchaseReceiptDto,
    userId?: string,
  ) {
    const order = await this.purchaseOrdersRepository.findById(
      tenantId,
      orderId,
    );
    if (!order) throw new NotFoundException('Purchase order not found');
    if (!['CONFIRMED', 'PARTIALLY_RECEIVED'].includes(order.status)) {
      throw new UnprocessableEntityException(
        'Order must be CONFIRMED to receive items',
      );
    }

    const seen = new Set<string>();
    const itemsById = new Map(order.items.map((i) => [i.id, i]));
    for (const line of dto.items) {
      if (seen.has(line.purchaseOrderItemId)) {
        throw new UnprocessableEntityException(
          'No se puede recibir la misma línea de la orden dos veces en una sola recepción',
        );
      }
      seen.add(line.purchaseOrderItemId);

      const item = itemsById.get(line.purchaseOrderItemId);
      if (!item) {
        throw new NotFoundException(
          `Item ${line.purchaseOrderItemId} not found in this order`,
        );
      }
      const remaining = item.quantity - item.receivedQty;
      if (line.quantity > remaining) {
        throw new UnprocessableEntityException(
          `La cantidad para ${item.product.name} (${line.quantity}) supera el saldo pendiente (${remaining})`,
        );
      }
      if (item.product.isSerialized) {
        const serials = line.serialNumbers ?? [];
        if (serials.length !== line.quantity) {
          throw new UnprocessableEntityException(
            `Se requieren ${line.quantity} números de serie para ${item.product.name}`,
          );
        }
      }
    }

    const receipt = await this.prisma.$transaction(async (tx) => {
      const receiptNumber =
        await this.purchaseReceiptsRepository.nextReceiptNumber(tenantId, tx);
      const created = await this.purchaseReceiptsRepository.create(
        tenantId,
        {
          purchaseOrderId: orderId,
          receiptNumber,
          warehouseId: dto.warehouseId,
          notes: dto.notes,
          createdById: userId,
          items: {
            create: dto.items.map((line) => {
              const item = itemsById.get(line.purchaseOrderItemId)!;
              return {
                purchaseOrderItemId: line.purchaseOrderItemId,
                productId: item.productId,
                quantity: line.quantity,
                unitCost: item.unitCost,
                batchNumber: line.batchNumber,
                expiresAt: line.expiresAt
                  ? new Date(line.expiresAt)
                  : undefined,
                serialNumbers: line.serialNumbers ?? [],
              };
            }),
          },
        },
        tx,
      );

      for (const line of dto.items) {
        const item = itemsById.get(line.purchaseOrderItemId)!;
        await this.purchaseOrdersRepository.updateItemReceivedQty(
          item.id,
          item.receivedQty + line.quantity,
          tx,
        );
      }

      const updatedItems = await this.purchaseOrdersRepository.findItems(
        orderId,
        tx,
      );
      const allReceived = updatedItems.every(
        (i) => i.receivedQty >= i.quantity,
      );
      await this.purchaseOrdersRepository.updateStatus(
        tenantId,
        orderId,
        allReceived ? 'RECEIVED' : 'PARTIALLY_RECEIVED',
        tx,
      );

      return created;
    });

    this.eventEmitter.emit('purchase.receipt.created', {
      tenantId,
      purchaseOrderId: orderId,
      purchaseReceiptId: receipt.id,
      warehouseId: dto.warehouseId,
    });
    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'procurement',
      action: 'purchase.receipt.created',
      resourceId: receipt.id,
    } satisfies AuditLogEvent);

    return this.findOne(tenantId, receipt.id);
  }
}
