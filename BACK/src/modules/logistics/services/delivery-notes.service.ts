import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { LogisticsSourcesRepository } from '../repositories/logistics-sources.repository';
import { DeliveryNotesRepository } from '../repositories/delivery-notes.repository';
import { DispatchDeliveryDto } from '../dto/dispatch-delivery.dto';
import type { AuditLogEvent } from '../../../audit/audit-log.event';

@Injectable()
export class DeliveryNotesService {
  constructor(
    private readonly repo: DeliveryNotesRepository,
    private readonly eventEmitter: EventEmitter2,
    private readonly sources: LogisticsSourcesRepository,
  ) {}

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
    if (!note.assignmentMode) {
      throw new UnprocessableEntityException(
        'Debe asignar la entrega antes de despacharla',
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
    if (note.status !== 'DISPATCHED') {
      throw new UnprocessableEntityException(
        'Solo se puede marcar como entregada una nota en estado despachada',
      );
    }
    await this.repo.update(tenantId, id, {
      status: 'DELIVERED',
      deliveredAt: new Date(),
    });
    // Trigger stock movements and SaleOrder → DELIVERED via sales listener
    this.eventEmitter.emit('delivery.note.delivered', {
      tenantId,
      saleOrderId: note.saleOrder.id,
      deliveryNoteId: id,
      userId,
    });
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
