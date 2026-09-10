import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ProductKind, ProductStatus, ProductionOrderStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { ProductionOrdersRepository } from '../repositories/production-orders.repository';
import { CreateProductionOrderDto } from '../dto/create-production-order.dto';
import { CompleteProductionOrderDto } from '../dto/complete-production-order.dto';
import type { AuditLogEvent } from '../../../audit/audit-log.event';
import type { ProductionOrderCompletedEvent } from '../events/production-order-completed.event';

function toNum(value: unknown): number {
  if (typeof value === 'object' && value !== null && 'toNumber' in value) {
    return (value as { toNumber(): number }).toNumber();
  }
  return Number(value ?? 0);
}

@Injectable()
export class ProductionOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: ProductionOrdersRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  findAll(tenantId: string, status?: ProductionOrderStatus) {
    return this.repository.findAll(tenantId, status);
  }

  async findOne(tenantId: string, id: string) {
    const order = await this.repository.findById(tenantId, id);
    if (!order) throw new NotFoundException('Orden de producción no encontrada');
    return order;
  }

  async create(tenantId: string, userId: string, dto: CreateProductionOrderDto) {
    const product = await this.repository.findProduct(tenantId, dto.productId);
    if (!product) throw new NotFoundException('Producto no encontrado');

    if (product.kind !== ProductKind.MANUFACTURED) {
      throw new UnprocessableEntityException(
        `Solo se puede producir un producto fabricado. "${product.name}" no lo es.`,
      );
    }
    if (product.status !== ProductStatus.ACTIVE) {
      throw new UnprocessableEntityException(
        `El producto "${product.name}" no está activo`,
      );
    }
    // El ingreso de un producto serializado exige un N/S por unidad y no hay
    // de dónde sacarlos al fabricar. Se rechaza acá y no en el listener,
    // porque allá la orden ya quedaría COMPLETED sin stock.
    if (product.isSerialized) {
      throw new UnprocessableEntityException(
        `"${product.name}" es serializado: producir con números de serie todavía no está soportado`,
      );
    }

    // Sin receta no hay nada que consumir: sería un alta de stock disfrazada
    // de producción, y para eso ya existe el ajuste de inventario.
    const recipe = await this.repository.findRecipe(tenantId, dto.productId);
    if (!recipe.length) {
      throw new UnprocessableEntityException(
        `"${product.name}" no tiene receta cargada. Definí de qué está hecho antes de producirlo.`,
      );
    }

    const order = await this.prisma.$transaction(async (tx) => {
      const orderNumber = await this.repository.nextOrderNumber(tenantId, tx);
      const created = await this.repository.create(
        tenantId,
        {
          orderNumber,
          productId: dto.productId,
          quantity: dto.quantity,
          warehouseId: dto.warehouseId,
          notes: dto.notes,
          createdById: userId,
        },
        tx,
      );

      // Snapshot de la receta: si mañana cambia, esta orden sigue mostrando lo
      // que realmente se planificó.
      await this.repository.createItems(
        recipe.map((line) => ({
          productionOrderId: created.id,
          componentId: line.componentId,
          plannedQuantity: toNum(line.quantity) * dto.quantity,
        })),
        tx,
      );

      return created;
    });

    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'production',
      action: 'production.order.created',
      resourceId: order.id,
    } satisfies AuditLogEvent);

    return this.findOne(tenantId, order.id);
  }

  async start(tenantId: string, id: string, userId?: string) {
    const order = await this.findOne(tenantId, id);
    if (order.status !== ProductionOrderStatus.DRAFT) {
      throw new UnprocessableEntityException(
        'Solo una orden en borrador puede iniciarse',
      );
    }

    await this.assertEnoughStock(tenantId, order);

    await this.repository.updateStatus(tenantId, id, {
      status: ProductionOrderStatus.IN_PROGRESS,
      startedAt: new Date(),
    });

    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'production',
      action: 'production.order.started',
      resourceId: id,
    } satisfies AuditLogEvent);

    return this.findOne(tenantId, id);
  }

  async complete(
    tenantId: string,
    id: string,
    dto: CompleteProductionOrderDto,
    userId?: string,
  ) {
    const order = await this.findOne(tenantId, id);
    if (order.status !== ProductionOrderStatus.IN_PROGRESS) {
      throw new UnprocessableEntityException(
        'Solo una orden en curso puede completarse',
      );
    }

    // Consumo real por componente; lo que no venga se toma como lo planificado.
    const byComponent = new Map(
      (dto.consumptions ?? []).map((c) => [c.componentId, c.usedQuantity]),
    );
    const consumed = order.items.map((item) => ({
      itemId: item.id,
      componentId: item.componentId,
      componentName: item.component.name,
      quantity: byComponent.get(item.componentId) ?? toNum(item.plannedQuantity),
    }));

    await this.assertEnoughStock(tenantId, order, consumed);

    await this.prisma.$transaction(async (tx) => {
      for (const line of consumed) {
        await this.repository.updateItemUsedQuantity(
          line.itemId,
          line.quantity,
          tx,
        );
      }
      await this.repository.updateStatus(
        tenantId,
        id,
        {
          status: ProductionOrderStatus.COMPLETED,
          completedAt: new Date(),
        },
        tx,
      );
    });

    // El stock lo mueve inventory con su propio listener: producción no toca
    // stock_movement ni importa nada de inventory (regla de CLAUDE.md).
    // emitAsync para que los movimientos existan antes de devolver la orden —
    // si no, el frontend refrescaría y vería el stock viejo.
    await this.eventEmitter.emitAsync('production.order.completed', {
      tenantId,
      productionOrderId: id,
      productId: order.productId,
      quantity: toNum(order.quantity),
      warehouseId: order.warehouseId,
      consumed: consumed.map((c) => ({
        productId: c.componentId,
        quantity: c.quantity,
      })),
    } satisfies ProductionOrderCompletedEvent);

    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'production',
      action: 'production.order.completed',
      resourceId: id,
    } satisfies AuditLogEvent);

    return this.findOne(tenantId, id);
  }

  async cancel(tenantId: string, id: string, userId?: string) {
    const order = await this.findOne(tenantId, id);
    if (order.status === ProductionOrderStatus.COMPLETED) {
      throw new UnprocessableEntityException(
        'Una orden completada no se puede cancelar: ya movió stock',
      );
    }
    if (order.status === ProductionOrderStatus.CANCELLED) {
      throw new UnprocessableEntityException('La orden ya está cancelada');
    }

    await this.repository.updateStatus(tenantId, id, {
      status: ProductionOrderStatus.CANCELLED,
    });

    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'production',
      action: 'production.order.cancelled',
      resourceId: id,
    } satisfies AuditLogEvent);

    return this.findOne(tenantId, id);
  }

  // No se puede fabricar con materia prima que no está. Se valida al iniciar
  // (temprano, para no arrancar algo inviable) y otra vez al completar, porque
  // entre medio pudo consumirse en otra orden o venderse.
  private async assertEnoughStock(
    tenantId: string,
    order: { items: { componentId: string; plannedQuantity: unknown; component: { name: string } }[] },
    consumed?: { componentId: string; componentName: string; quantity: number }[],
  ) {
    const lines =
      consumed ??
      order.items.map((i) => ({
        componentId: i.componentId,
        componentName: i.component.name,
        quantity: toNum(i.plannedQuantity),
      }));

    const stock = await this.repository.getStock(
      tenantId,
      lines.map((l) => l.componentId),
    );

    const missing = lines
      .filter((l) => l.quantity > 0 && (stock.get(l.componentId) ?? 0) < l.quantity)
      .map(
        (l) =>
          `${l.componentName} (necesita ${l.quantity}, hay ${stock.get(l.componentId) ?? 0})`,
      );

    if (missing.length) {
      throw new UnprocessableEntityException(
        `No hay stock suficiente de: ${missing.join(', ')}`,
      );
    }
  }
}
