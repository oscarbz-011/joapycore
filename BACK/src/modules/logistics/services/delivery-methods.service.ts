import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventBus } from '../../../common/events/event-bus';
import type { AuditLogEvent } from '../../../audit/audit-log.event';
import {
  DecideSellerDeliveryDto,
  RequestSellerDeliveryDto,
  SellerDeliveredDto,
  SetDeliveryMethodDto,
} from '../dto/delivery-method.dto';
import { DeliveryNotesRepository } from '../repositories/delivery-notes.repository';
import { DeliveryTrackingEventsRepository } from '../repositories/delivery-tracking-events.repository';
import { LogisticsSourcesRepository } from '../repositories/logistics-sources.repository';
import { DeliveryNotesService } from './delivery-notes.service';

/** Quién pide la acción: su usuario y sus permisos, tal como vienen del token. */
export interface DeliveryActor {
  userId: string;
  permissions: string[];
}

const customerName = (customer: {
  firstName: string;
  secondFirstName?: string | null;
  lastName: string;
  secondLastName?: string | null;
}) =>
  [
    customer.firstName,
    customer.secondFirstName,
    customer.lastName,
    customer.secondLastName,
  ]
    .filter(Boolean)
    .join(' ');

// Lo que se limpia al dejar de ser una entrega asignada a alguien.
const NO_ASSIGNMENT = {
  assignmentMode: null,
  assignedEmployeeId: null,
  carrier: null,
  externalTrackingRef: null,
} as const;

// Lo que se limpia al dejar de ser una entrega a cargo del vendedor.
const NO_SELLER_REQUEST = {
  sellerRequestStatus: null,
  sellerRequestNote: null,
  sellerRequestedById: null,
  sellerRequestedAt: null,
  sellerDecidedById: null,
  sellerDecidedAt: null,
  sellerDecisionNote: null,
} as const;

/**
 * Cómo se entrega una venta lista para entregar:
 *  - HOME_DELIVERY: la empresa la lleva a la dirección del cliente (un
 *    repartidor propio o un courier). Es el camino de siempre.
 *  - PICKUP: el cliente de la venta la retira en la sucursal. No hay
 *    repartidor ni recorrido; se cierra confirmando que la retiró.
 *  - SELLER: caso excepcional, el vendedor la lleva en persona. Lo pide el
 *    vendedor y lo tiene que autorizar un supervisor.
 */
@Injectable()
export class DeliveryMethodsService {
  constructor(
    private readonly notes: DeliveryNotesRepository,
    private readonly sources: LogisticsSourcesRepository,
    private readonly trackingEvents: DeliveryTrackingEventsRepository,
    private readonly deliveryNotesService: DeliveryNotesService,
    private readonly eventEmitter: EventBus,
  ) {}

  /** La entrega de un pedido, para logística o para el vendedor del pedido. */
  async findForOrder(
    tenantId: string,
    saleOrderId: string,
    actor: DeliveryActor,
  ) {
    const note = await this.notes.findBySaleOrder(tenantId, saleOrderId);
    if (!note) {
      throw new NotFoundException('Este pedido todavía no tiene una entrega');
    }
    if (
      !actor.permissions.includes('logistics:read') &&
      !this.isSeller(note, actor)
    ) {
      throw new ForbiddenException(
        'No tenés acceso a la entrega de este pedido',
      );
    }
    return note;
  }

  /** Pasa la entrega a "retira el cliente" o la vuelve a "envío a domicilio". */
  async setMethod(
    tenantId: string,
    id: string,
    dto: SetDeliveryMethodDto,
    actor: DeliveryActor,
  ) {
    const note = await this.load(tenantId, id);
    if (
      !actor.permissions.includes('logistics:assign') &&
      !this.isSeller(note, actor)
    ) {
      throw new ForbiddenException(
        'Solo logística o el vendedor del pedido pueden cambiar cómo se entrega',
      );
    }
    this.assertPending(note.status);

    await this.patch(
      tenantId,
      id,
      { status: 'PENDING' },
      // Cambiar el método deja atrás lo que era propio del anterior.
      { method: dto.method, ...NO_ASSIGNMENT, ...NO_SELLER_REQUEST },
    );
    this.changed(tenantId, id, actor.userId, 'delivery.method.changed', {
      before: note.method,
      method: dto.method,
    });
    return this.load(tenantId, id);
  }

  /**
   * El cliente retiró el pedido en la sucursal: cierra la entrega. Quien
   * retira es siempre el cliente de la venta, no un tercero: no se elige, se
   * confirma. Sus datos quedan copiados en la entrega tal como eran ese día.
   */
  async registerPickup(tenantId: string, id: string, actor: DeliveryActor) {
    const note = await this.load(tenantId, id);
    if (
      !actor.permissions.includes('logistics:manage') &&
      !this.isSeller(note, actor)
    ) {
      throw new ForbiddenException(
        'Solo logística o el vendedor del pedido pueden registrar el retiro',
      );
    }
    if (note.method !== 'PICKUP') {
      throw new UnprocessableEntityException(
        'Esta entrega no está marcada como retiro en sucursal',
      );
    }
    this.assertPending(note.status);

    await this.patch(
      tenantId,
      id,
      { status: 'PENDING', method: 'PICKUP' },
      {
        pickedUpByName: customerName(note.saleOrder.customer),
        pickedUpByDocument: note.saleOrder.customer.documentNumber ?? null,
      },
    );
    return this.deliveryNotesService.complete(tenantId, id, actor.userId);
  }

  /** El vendedor pide llevar el pedido en persona. Lo decide un supervisor. */
  async requestSellerDelivery(
    tenantId: string,
    id: string,
    dto: RequestSellerDeliveryDto,
    actor: DeliveryActor,
  ) {
    const note = await this.load(tenantId, id);
    if (!this.isSeller(note, actor)) {
      throw new ForbiddenException(
        'Solo el vendedor del pedido puede pedir llevarlo en persona',
      );
    }
    this.assertPending(note.status);
    if (
      note.sellerRequestStatus === 'PENDING' ||
      note.sellerRequestStatus === 'AUTHORIZED'
    ) {
      throw new UnprocessableEntityException(
        note.sellerRequestStatus === 'PENDING'
          ? 'Ya pediste llevar este pedido: falta que lo autorice un supervisor'
          : 'Ya estás autorizado a llevar este pedido',
      );
    }
    // La entrega queda a nombre de un empleado: sin esa ficha no hay a quién
    // asignársela.
    const employee = await this.sources.findEmployeeByUser(
      tenantId,
      actor.userId,
    );
    if (!employee) {
      throw new UnprocessableEntityException(
        'Tu usuario no está vinculado a un empleado. Pedí que lo vinculen en RRHH para poder llevar pedidos.',
      );
    }

    await this.patch(
      tenantId,
      id,
      { status: 'PENDING' },
      {
        method: 'SELLER',
        ...NO_ASSIGNMENT,
        ...NO_SELLER_REQUEST,
        sellerRequestStatus: 'PENDING',
        sellerRequestNote: dto.note?.trim() || null,
        sellerRequestedById: actor.userId,
        sellerRequestedAt: new Date(),
      },
    );
    this.eventEmitter.emit('delivery.seller.requested', {
      tenantId,
      deliveryNoteId: id,
    });
    this.changed(tenantId, id, actor.userId, 'delivery.seller.requested', {
      note: dto.note,
    });
    return this.load(tenantId, id);
  }

  /** El supervisor autoriza: la entrega queda asignada al vendedor. */
  async authorizeSellerDelivery(
    tenantId: string,
    id: string,
    dto: DecideSellerDeliveryDto,
    userId: string,
  ) {
    const note = await this.loadPendingRequest(tenantId, id, userId);
    const employee = note.sellerRequestedById
      ? await this.sources.findEmployeeByUser(
          tenantId,
          note.sellerRequestedById,
        )
      : null;
    if (!employee) {
      throw new UnprocessableEntityException(
        'El vendedor ya no está vinculado a un empleado: no se le puede asignar la entrega',
      );
    }

    await this.patch(
      tenantId,
      id,
      { status: 'PENDING', sellerRequestStatus: 'PENDING' },
      {
        sellerRequestStatus: 'AUTHORIZED',
        sellerDecidedById: userId,
        sellerDecidedAt: new Date(),
        sellerDecisionNote: dto.note?.trim() || null,
        assignmentMode: 'INTERNAL_EMPLOYEE',
        assignedEmployeeId: employee.id,
        carrier: `${employee.firstName} ${employee.lastName}`,
      },
    );
    this.eventEmitter.emit('delivery.assigned', {
      tenantId,
      deliveryNoteId: id,
    });
    this.changed(tenantId, id, userId, 'delivery.seller.authorized', {
      sellerUserId: note.sellerRequestedById,
      note: dto.note,
    });
    return this.load(tenantId, id);
  }

  /** El supervisor no autoriza: vuelve a ser un envío común, sin asignar. */
  async rejectSellerDelivery(
    tenantId: string,
    id: string,
    dto: DecideSellerDeliveryDto,
    userId: string,
  ) {
    const note = await this.loadPendingRequest(tenantId, id, userId);
    const reason = dto.note?.trim();
    if (!reason) {
      throw new UnprocessableEntityException('Indicá por qué no se autoriza');
    }

    await this.patch(
      tenantId,
      id,
      { status: 'PENDING', sellerRequestStatus: 'PENDING' },
      {
        method: 'HOME_DELIVERY',
        sellerRequestStatus: 'REJECTED',
        sellerDecidedById: userId,
        sellerDecidedAt: new Date(),
        sellerDecisionNote: reason,
      },
    );
    this.eventEmitter.emit('delivery.assigned', {
      tenantId,
      deliveryNoteId: id,
    });
    this.changed(tenantId, id, userId, 'delivery.seller.rejected', {
      sellerUserId: note.sellerRequestedById,
      reason,
    });
    return this.load(tenantId, id);
  }

  /**
   * El vendedor autorizado entregó el pedido. Alcanza con marcarlo; si manda
   * la ubicación, queda guardada en el recorrido igual que la de un
   * repartidor.
   */
  async markSellerDelivered(
    tenantId: string,
    id: string,
    dto: SellerDeliveredDto,
    actor: DeliveryActor,
  ) {
    const note = await this.load(tenantId, id);
    if (note.method !== 'SELLER' || note.sellerRequestStatus !== 'AUTHORIZED') {
      throw new UnprocessableEntityException(
        'Esta entrega no está autorizada para que la lleve el vendedor',
      );
    }
    if (!actor.permissions.includes('logistics:manage')) {
      const employee = await this.sources.findEmployeeByUser(
        tenantId,
        actor.userId,
      );
      if (!employee || note.assignedEmployeeId !== employee.id) {
        throw new ForbiddenException('Esta entrega no está asignada a vos');
      }
    }
    if (note.status !== 'PENDING' && note.status !== 'DISPATCHED') {
      throw new UnprocessableEntityException('Esta entrega ya fue cerrada');
    }

    await this.trackingEvents.create(tenantId, {
      deliveryNoteId: id,
      source: 'MANUAL',
      checkpoint: 'DELIVERED',
      latitude: dto.latitude,
      longitude: dto.longitude,
      notes: dto.notes?.trim() || null,
      recordedById: actor.userId,
    });
    return this.deliveryNotesService.complete(tenantId, id, actor.userId);
  }

  // ── Privados ────────────────────────────────────────────────────────────

  private async load(tenantId: string, id: string) {
    const note = await this.notes.findById(tenantId, id);
    if (!note) throw new NotFoundException('Nota de entrega no encontrada');
    return note;
  }

  // Pedido pendiente de decisión, y que no lo decida quien lo pidió: la
  // autorización es de un supervisor, no del propio vendedor.
  private async loadPendingRequest(
    tenantId: string,
    id: string,
    userId: string,
  ) {
    const note = await this.load(tenantId, id);
    if (note.sellerRequestStatus !== 'PENDING') {
      throw new UnprocessableEntityException(
        'Esta entrega no tiene un pedido del vendedor esperando autorización',
      );
    }
    if (note.sellerRequestedById === userId) {
      throw new ForbiddenException(
        'No podés autorizar ni rechazar tu propio pedido: lo tiene que decidir otro supervisor',
      );
    }
    this.assertPending(note.status);
    return note;
  }

  private isSeller(
    note: { saleOrder: { sellerId: string | null } },
    actor: DeliveryActor,
  ) {
    return note.saleOrder.sellerId === actor.userId;
  }

  private assertPending(status: string) {
    if (status !== 'PENDING') {
      throw new UnprocessableEntityException(
        'Solo se puede cambiar cómo se entrega mientras la entrega está pendiente',
      );
    }
  }

  // Escribe solo si la entrega sigue como se la leyó: dos personas no pueden
  // resolver lo mismo a la vez.
  private async patch(
    tenantId: string,
    id: string,
    whileIs: Parameters<DeliveryNotesRepository['patch']>[2],
    data: Parameters<DeliveryNotesRepository['patch']>[3],
  ) {
    const { count } = await this.notes.patch(tenantId, id, whileIs, data);
    if (count === 0) {
      throw new ConflictException(
        'La entrega cambió mientras tanto. Volvé a cargarla.',
      );
    }
  }

  private changed(
    tenantId: string,
    deliveryNoteId: string,
    userId: string,
    action: string,
    after: Record<string, unknown>,
  ) {
    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'logistics',
      action,
      resourceId: deliveryNoteId,
      after,
    } satisfies AuditLogEvent);
  }
}
