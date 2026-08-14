import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DeliveryNotesRepository } from '../repositories/delivery-notes.repository';
import { DispatchDeliveryDto } from '../dto/dispatch-delivery.dto';
import type { AuditLogEvent } from '../../../audit/audit-log.event';

@Injectable()
export class DeliveryNotesService {
  constructor(
    private readonly repo: DeliveryNotesRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  findAll(tenantId: string, status?: string) {
    const validStatuses = ['PENDING', 'DISPATCHED', 'DELIVERED', 'CANCELLED'] as const;
    type S = (typeof validStatuses)[number];
    const parsed = validStatuses.includes(status as S) ? (status as S) : undefined;
    return this.repo.findAll(tenantId, parsed);
  }

  async findOne(tenantId: string, id: string) {
    const note = await this.repo.findById(tenantId, id);
    if (!note) throw new NotFoundException('Nota de entrega no encontrada');
    return note;
  }

  async dispatch(tenantId: string, id: string, dto: DispatchDeliveryDto, userId?: string) {
    const note = await this.findOne(tenantId, id);
    if (note.status !== 'PENDING') {
      throw new UnprocessableEntityException(
        'Solo se puede despachar una entrega en estado pendiente',
      );
    }
    await this.repo.update(tenantId, id, {
      status: 'DISPATCHED',
      carrier: dto.carrier,
      vehicle: dto.vehicle,
      notes: dto.notes,
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
