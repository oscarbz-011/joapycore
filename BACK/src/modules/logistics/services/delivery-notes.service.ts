import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OutboxService } from '../../../outbox/outbox.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { LogisticsSourcesRepository } from '../repositories/logistics-sources.repository';
import { DeliveryNotesRepository } from '../repositories/delivery-notes.repository';
import { DispatchDeliveryDto } from '../dto/dispatch-delivery.dto';
import type { AuditLogEvent } from '../../../audit/audit-log.event';

@Injectable()
export class DeliveryNotesService {
  private readonly logger = new Logger(DeliveryNotesService.name);

  constructor(
    private readonly repo: DeliveryNotesRepository,
    private readonly eventEmitter: EventEmitter2,
    private readonly sources: LogisticsSourcesRepository,
    // Solo para abrir la transacción del cierre.
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  /**
   * Crea la nota PENDING de los pedidos confirmados que no tienen una. Sin
   * `tenantId` recorre todos los tenants con Logística activa.
   */
  async backfillPending(tenantId?: string): Promise<number> {
    const orders =
      await this.sources.findConfirmedOrdersWithoutDeliveryNote(tenantId);
    let created = 0;
    for (const order of orders) {
      try {
        const note = await this.repo.ensurePendingForOrder(
          order.tenantId,
          order.id,
        );
        if (note.created) created++;
      } catch (error) {
        this.logger.warn(
          `No se pudo crear la nota de entrega del pedido ${order.id}: ${(error as Error).message}`,
        );
      }
    }
    return created;
  }

  /**
   * Pone Logística al día con lo que pasó mientras estuvo apagada. Sin
   * `tenantId` (al arrancar), en todos los tenants con Logística activa.
   */
  async syncWithSales(tenantId?: string) {
    const closed = await this.repo.closeDeliveredOutsideLogistics(tenantId);
    const created = await this.backfillPending(tenantId);
    if (tenantId && created > 0) {
      this.eventEmitter.emit('delivery.note.created', { tenantId });
    }
    return { closed, created };
  }

  findAll(tenantId: string, status?: string) {
    const validStatuses = [
      'PENDING',
      'DISPATCHED',
      'DELIVERED',
      'CANCELLED',
    ] as const;
    type S = (typeof validStatuses)[number];
    const parsed = validStatuses.includes(status as S)
      ? (status as S)
      : undefined;
    return this.repo.findAll(tenantId, parsed);
  }

  async findOne(tenantId: string, id: string) {
    const note = await this.repo.findById(tenantId, id);
    if (!note) throw new NotFoundException('Nota de entrega no encontrada');
    return note;
  }

  // El repartidor asignado también puede despachar su propia entrega
  // (empezar el viaje) sin depender de que un admin/despachador lo haga
  // primero — mismo criterio que recordTrackingEvent() en
  // DeliveryTrackingService: sin @Permissions() en el controller (PermissionsGuard
  // es AND-only, no sirve para un OR de permisos), la verificación vive acá.
  async dispatch(
    tenantId: string,
    id: string,
    dto: DispatchDeliveryDto,
    userId: string | undefined,
    userPermissions: string[],
  ) {
    const note = await this.findOne(tenantId, id);

    const hasManage = userPermissions.includes('logistics:manage');
    const hasTrack = userPermissions.includes('logistics:track');
    if (!hasManage && !hasTrack) {
      throw new ForbiddenException(
        'No tenés permiso para despachar esta entrega',
      );
    }
    if (!hasManage) {
      const employee = userId
        ? await this.sources.findEmployeeByUser(tenantId, userId)
        : null;
      if (!employee || note.assignedEmployeeId !== employee.id) {
        throw new ForbiddenException('Esta entrega no está asignada a vos');
      }
    }

    if (note.status !== 'PENDING') {
      throw new UnprocessableEntityException(
        'Solo se puede despachar una entrega en estado pendiente',
      );
    }
    if (note.method === 'PICKUP') {
      throw new UnprocessableEntityException(
        'Este pedido lo retira el cliente en la sucursal: no se despacha',
      );
    }
    if (!note.assignmentMode) {
      throw new UnprocessableEntityException(
        'Debe asignar la entrega antes de despacharla',
      );
    }
    // Las entregas de una ruta salen todas juntas, cuando la ruta se inicia.
    if (note.route) {
      throw new UnprocessableEntityException(
        `Esta entrega sale con la ruta ${note.route.code}: iniciá la ruta para despacharla`,
      );
    }
    await this.repo.update(tenantId, id, {
      status: 'DISPATCHED',
      carrier: dto.carrier,
      vehicle: dto.vehicle,
      notes: dto.notes,
    });
    this.eventEmitter.emit('delivery.dispatched', {
      tenantId,
      saleOrderId: note.saleOrder.id,
      deliveryNoteId: id,
    });
    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'logistics',
      action: 'delivery.dispatched',
      resourceId: id,
    } satisfies AuditLogEvent);
    return this.findOne(tenantId, id);
  }

  async markDelivered(tenantId: string, id: string, userId?: string) {
    const note = await this.findOne(tenantId, id);
    if (note.method === 'PICKUP') {
      throw new UnprocessableEntityException(
        'Este pedido lo retira el cliente: registrá el retiro con quién se lo llevó',
      );
    }
    if (note.status !== 'DISPATCHED') {
      throw new UnprocessableEntityException(
        'Solo se puede marcar como entregada una nota en estado despachada',
      );
    }
    return this.finish(tenantId, note, userId);
  }

  /**
   * Cierra la entrega. El retiro en sucursal y la entrega a cargo del
   * vendedor no pasan por "despachada": se cierran desde pendiente. Quien
   * llama ya validó que corresponde.
   */
  async complete(tenantId: string, id: string, userId?: string) {
    const note = await this.findOne(tenantId, id);
    if (note.status !== 'PENDING' && note.status !== 'DISPATCHED') {
      throw new UnprocessableEntityException('Esta entrega ya fue cerrada');
    }
    return this.finish(tenantId, note, userId);
  }

  private async finish(
    tenantId: string,
    note: { id: string; saleOrder: { id: string } },
    userId?: string,
  ) {
    const id = note.id;
    // Ventas descuenta el stock con este evento: va por el outbox para que una
    // caída entre el cierre y el descuento no lo pierda.
    const eventId = await this.prisma.$transaction(async (tx) => {
      if ((await this.repo.close(tenantId, id, tx)) === 0) {
        throw new UnprocessableEntityException(
          'Esta entrega ya fue cerrada o cancelada',
        );
      }
      return this.outbox.enqueue(tx, tenantId, 'delivery.note.delivered', {
        tenantId,
        saleOrderId: note.saleOrder.id,
        deliveryNoteId: id,
        userId,
      });
    });
    await this.outbox.dispatch(eventId);
    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'logistics',
      action: 'delivery.delivered',
      resourceId: id,
    } satisfies AuditLogEvent);
    return this.findOne(tenantId, id);
  }
}
