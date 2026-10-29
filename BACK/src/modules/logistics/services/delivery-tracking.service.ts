import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventBus } from '../../../common/events/event-bus';
import { DeliveryAssignmentMode, DeliveryNoteStatus } from '@prisma/client';
import { LogisticsSourcesRepository } from '../repositories/logistics-sources.repository';
import { DeliveryNotesRepository } from '../repositories/delivery-notes.repository';
import { DeliveryTrackingEventsRepository } from '../repositories/delivery-tracking-events.repository';
import { DeliveryNotesService } from './delivery-notes.service';
import { DeliveryRoutesService } from './delivery-routes.service';
import { AssignDeliveryDto } from '../dto/assign-delivery.dto';
import { RecordTrackingEventDto } from '../dto/record-tracking-event.dto';
import type { AuditLogEvent } from '../../../audit/audit-log.event';

const VALID_STATUSES = [
  'PENDING',
  'DISPATCHED',
  'DELIVERED',
  'CANCELLED',
] as const;

@Injectable()
export class DeliveryTrackingService {
  constructor(
    private readonly sources: LogisticsSourcesRepository,
    private readonly deliveryNotesRepository: DeliveryNotesRepository,
    private readonly trackingEventsRepository: DeliveryTrackingEventsRepository,
    private readonly deliveryNotesService: DeliveryNotesService,
    private readonly eventEmitter: EventBus,
    private readonly deliveryRoutesService: DeliveryRoutesService,
  ) {}

  // Lectura cross-módulo vía repositorio (no importa ninguna clase de hr).
  listCouriers(tenantId: string) {
    return this.sources.findCouriers(tenantId);
  }

  async assign(
    tenantId: string,
    deliveryNoteId: string,
    dto: AssignDeliveryDto,
    userId?: string,
  ) {
    const note = await this.deliveryNotesRepository.findById(
      tenantId,
      deliveryNoteId,
    );
    if (!note) throw new NotFoundException('Nota de entrega no encontrada');
    if (!['PENDING', 'DISPATCHED'].includes(note.status)) {
      throw new UnprocessableEntityException(
        'Solo se puede asignar una entrega pendiente o despachada',
      );
    }
    // Un retiro en sucursal no tiene repartidor, y la entrega a cargo del
    // vendedor la asigna el supervisor al autorizarla.
    if (note.method !== 'HOME_DELIVERY') {
      throw new UnprocessableEntityException(
        note.method === 'PICKUP'
          ? 'Este pedido lo retira el cliente en la sucursal. Para asignarle un repartidor, pasalo primero a envío a domicilio.'
          : 'Este pedido lo pidió llevar el vendedor. Para asignarle un repartidor, pasalo primero a envío a domicilio.',
      );
    }

    let employee: { id: string; firstName: string; lastName: string } | null =
      null;
    if (dto.assignedEmployeeId) {
      employee = await this.sources.findActiveEmployee(
        tenantId,
        dto.assignedEmployeeId,
      );
      if (!employee) throw new NotFoundException('Empleado no encontrado');
    }

    const isExternalCompany =
      dto.assignmentMode === DeliveryAssignmentMode.EXTERNAL_COMPANY;

    // Una entrega que ya salió con su ruta no cambia de manos: si no se
    // pudo entregar, se registra como no realizada y vuelve a pendiente.
    if (note.status === 'DISPATCHED' && note.route) {
      throw new UnprocessableEntityException(
        `Esta entrega ya salió con la ruta ${note.route.code}. Si no se pudo entregar, registralo en la ruta.`,
      );
    }
    // Asignar a un repartidor pone la entrega en su ruta de ese día (o la
    // crea). Un courier externo no recorre una ruta nuestra.
    if (note.status === 'PENDING') {
      if (employee && !isExternalCompany) {
        await this.deliveryRoutesService.assignToDriver(
          tenantId,
          deliveryNoteId,
          employee,
          { date: dto.routeDate, userId },
        );
      } else if (note.route) {
        await this.deliveryRoutesService.removeDelivery(
          tenantId,
          deliveryNoteId,
          userId,
        );
      }
    }
    const carrier = isExternalCompany
      ? dto.carrier
      : employee
        ? `${employee.firstName} ${employee.lastName}`
        : (note.carrier ?? undefined);

    await this.deliveryNotesRepository.assign(tenantId, deliveryNoteId, {
      assignmentMode: dto.assignmentMode,
      assignedEmployeeId: isExternalCompany
        ? null
        : (dto.assignedEmployeeId ?? null),
      carrier,
      externalTrackingRef: dto.externalTrackingRef ?? null,
    });

    this.eventEmitter.emit('delivery.assigned', { tenantId, deliveryNoteId });
    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'logistics',
      action: 'delivery.assigned',
      resourceId: deliveryNoteId,
    } satisfies AuditLogEvent);

    return this.deliveryNotesRepository.findById(tenantId, deliveryNoteId);
  }

  async findMine(tenantId: string, userId: string, status?: string) {
    const employee = await this.sources.findEmployeeByUser(tenantId, userId);
    if (!employee) return [];
    const parsed = VALID_STATUSES.includes(status as DeliveryNoteStatus)
      ? (status as DeliveryNoteStatus)
      : undefined;
    return this.deliveryNotesRepository.findMine(tenantId, employee.id, parsed);
  }

  // Además de registrar el checkpoint, esta es la acción de "marcar
  // entregado" del propio repartidor — evita necesitar un guard con OR de
  // permisos (PermissionsGuard es AND-only): el controller no lleva
  // @Permissions(), la verificación vive acá.
  async recordTrackingEvent(
    tenantId: string,
    deliveryNoteId: string,
    dto: RecordTrackingEventDto,
    userId: string,
    userPermissions: string[],
  ) {
    const note = await this.deliveryNotesRepository.findById(
      tenantId,
      deliveryNoteId,
    );
    if (!note) throw new NotFoundException('Nota de entrega no encontrada');

    const hasManage = userPermissions.includes('logistics:manage');
    const hasTrack = userPermissions.includes('logistics:track');
    if (!hasManage && !hasTrack) {
      throw new ForbiddenException(
        'No tenés permiso para registrar el recorrido de esta entrega',
      );
    }

    if (note.assignmentMode === DeliveryAssignmentMode.EXTERNAL_COMPANY) {
      throw new UnprocessableEntityException(
        'Esta entrega está a cargo de un courier externo — no tiene tracking en el sistema',
      );
    }

    if (!hasManage) {
      const employee = await this.sources.findEmployeeByUser(tenantId, userId);
      if (!employee || note.assignedEmployeeId !== employee.id) {
        throw new ForbiddenException('Esta entrega no está asignada a vos');
      }
    }

    const event = await this.trackingEventsRepository.create(tenantId, {
      deliveryNoteId,
      source: 'MANUAL',
      checkpoint: dto.checkpoint,
      latitude: dto.latitude,
      longitude: dto.longitude,
      locationConfirmed: dto.locationConfirmed,
      notes: dto.notes,
      recordedById: userId,
    });

    if (
      dto.locationConfirmed === false &&
      dto.latitude != null &&
      dto.longitude != null
    ) {
      await this.sources.updateCustomerLocation(
        tenantId,
        note.saleOrder.customerId,
        dto.latitude,
        dto.longitude,
      );
    }

    if (dto.checkpoint === 'DELIVERED') {
      await this.deliveryNotesService.markDelivered(
        tenantId,
        deliveryNoteId,
        userId,
      );
    }

    this.eventEmitter.emit('delivery.tracking.recorded', {
      tenantId,
      deliveryNoteId,
    });

    return event;
  }

  listTrackingEvents(tenantId: string, deliveryNoteId: string) {
    return this.trackingEventsRepository.findByDeliveryNote(
      tenantId,
      deliveryNoteId,
    );
  }
}
