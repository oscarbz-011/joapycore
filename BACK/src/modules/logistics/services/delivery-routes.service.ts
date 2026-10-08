import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { AuditLogEvent } from '../../../audit/audit-log.event';
import { startOfBusinessDay } from '../../../common/utils/business-date.util';
import { isSameStops, parseRouteDay, placeStop } from '../delivery-route.util';
import {
  AddRouteDeliveryDto,
  CreateDeliveryRouteDto,
  ReorderRouteDto,
  ScheduleDeliveryDto,
  UpdateDeliveryRouteDto,
} from '../dto/delivery-route.dto';
import {
  DeliveryRoutesRepository,
  type RouteRow,
  type RouteStopRow,
  type StopChange,
} from '../repositories/delivery-routes.repository';
import { LogisticsSourcesRepository } from '../repositories/logistics-sources.repository';

type Driver = { id: string; firstName: string; lastName: string };

// La ruta le da su repartidor a cada entrega, así le aparece en "Mis entregas".
const assignedTo = (driver: Driver): StopChange => ({
  assignmentMode: 'INTERNAL_EMPLOYEE',
  assignedEmployeeId: driver.id,
  carrier: `${driver.firstName} ${driver.lastName}`,
});

const UNASSIGNED: StopChange = {
  assignmentMode: null,
  assignedEmployeeId: null,
  carrier: null,
};

const OUT_OF_ROUTE: StopChange = { routeId: null, routeOrder: null };

const toDay = (date: Date | null) =>
  date ? date.toISOString().slice(0, 10) : null;

const toNumber = (value: unknown) =>
  value === null || value === undefined ? null : Number(value);

function toStop(row: RouteStopRow) {
  const { customer, items } = row.saleOrder;
  return {
    id: row.id,
    noteNumber: row.noteNumber,
    status: row.status,
    routeId: row.routeId,
    scheduledDate: toDay(row.scheduledDate),
    scheduledShift: row.scheduledShift,
    saleOrderId: row.saleOrder.id,
    units: items.reduce((sum, item) => sum + Number(item.quantity), 0),
    customer: {
      id: customer.id,
      name: `${customer.firstName} ${customer.lastName}`.trim(),
      phone: customer.phone,
      address:
        [
          customer.homeStreet ?? customer.address,
          customer.homeNeighborhood,
          customer.city,
        ]
          .filter(Boolean)
          .join(', ') || null,
      reference: customer.homeReference,
      latitude: toNumber(customer.latitude),
      longitude: toNumber(customer.longitude),
    },
  };
}

function toRoute(row: RouteRow) {
  return {
    id: row.id,
    date: toDay(row.routeDate),
    shift: row.shift,
    name: row.name,
    vehicle: row.vehicle,
    driver: row.driver,
    stops: row.deliveries.map(toStop),
  };
}

@Injectable()
export class DeliveryRoutesService {
  constructor(
    private readonly routes: DeliveryRoutesRepository,
    private readonly sources: LogisticsSourcesRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /** Las rutas de un día y las entregas que todavía esperan una. */
  async board(tenantId: string, date: string) {
    const day = this.dayOf(date);
    const [routes, unplanned] = await Promise.all([
      this.routes.findForDay(tenantId, day),
      this.routes.findUnplanned(tenantId),
    ]);
    return {
      date: toDay(day),
      routes: routes.map(toRoute),
      unplanned: unplanned.map(toStop),
    };
  }

  async create(tenantId: string, dto: CreateDeliveryRouteDto, userId?: string) {
    const day = this.upcomingDay(dto.date);
    if (dto.driverEmployeeId) {
      await this.driverOf(tenantId, dto.driverEmployeeId);
    }
    const { id } = await this.routes.create({
      tenantId,
      routeDate: day,
      shift: dto.shift,
      driverEmployeeId: dto.driverEmployeeId,
      vehicle: dto.vehicle?.trim() || undefined,
      name: dto.name?.trim() || undefined,
      createdById: userId,
    });
    this.changed(tenantId, userId, 'delivery.route.created', id);
    return this.findOne(tenantId, id);
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateDeliveryRouteDto,
    userId?: string,
  ) {
    const route = await this.routeOf(tenantId, id);

    // Cambiar el repartidor de la ruta se lo cambia a las entregas que
    // todavía no salieron; quitarlo las deja sin asignar.
    let pendingStops: StopChange | undefined;
    if (
      dto.driverEmployeeId !== undefined &&
      dto.driverEmployeeId !== route.driverEmployeeId
    ) {
      if (dto.driverEmployeeId) {
        pendingStops = assignedTo(
          await this.driverOf(tenantId, dto.driverEmployeeId),
        );
      } else if (route.driverEmployeeId) {
        pendingStops = UNASSIGNED;
      }
    }

    await this.routes.update(
      tenantId,
      id,
      {
        ...(dto.driverEmployeeId !== undefined && {
          driverEmployeeId: dto.driverEmployeeId,
        }),
        ...(dto.vehicle !== undefined && {
          vehicle: dto.vehicle.trim() || null,
        }),
        ...(dto.name !== undefined && { name: dto.name.trim() || null }),
      },
      pendingStops,
    );
    this.changed(tenantId, userId, 'delivery.route.updated', id);
    return this.findOne(tenantId, id);
  }

  async remove(tenantId: string, id: string, userId?: string) {
    const route = await this.routeOf(tenantId, id);
    const removed = await this.routes.remove(tenantId, id, {
      ...OUT_OF_ROUTE,
      ...(route.driverEmployeeId ? UNASSIGNED : {}),
    });
    if (!removed) {
      throw new ConflictException(
        'Esta ruta ya tiene entregas en camino o entregadas: no se puede borrar',
      );
    }
    this.changed(tenantId, userId, 'delivery.route.deleted', id);
    return { id };
  }

  /** Suma una entrega a la ruta, o la trae desde otra. */
  async addDelivery(
    tenantId: string,
    routeId: string,
    dto: AddRouteDeliveryDto,
    userId?: string,
  ) {
    const route = await this.routeOf(tenantId, routeId);
    this.assertNotPast(route.routeDate);
    const note = await this.plannableStop(tenantId, dto.deliveryNoteId);

    const change: StopChange = {
      scheduledDate: route.routeDate,
      scheduledShift: route.shift,
      ...(route.driver
        ? assignedTo(route.driver)
        : await this.releaseFromRoute(tenantId, note, routeId)),
    };
    const placed = await this.routes.placeStop(
      tenantId,
      routeId,
      note.id,
      change,
      placeStop(
        route.deliveries.map((stop) => stop.id),
        note.id,
        dto.position,
      ),
    );
    if (!placed) throw this.changedMeanwhile();

    this.changed(tenantId, userId, 'delivery.route.stop_added', routeId);
    return this.findOne(tenantId, routeId);
  }

  async reorder(
    tenantId: string,
    routeId: string,
    dto: ReorderRouteDto,
    userId?: string,
  ) {
    const route = await this.routeOf(tenantId, routeId);
    const current = route.deliveries.map((stop) => stop.id);
    if (!isSameStops(current, dto.deliveryNoteIds)) {
      throw new ConflictException(
        'La ruta cambió mientras la ordenabas. Actualizá la pantalla y volvé a intentar.',
      );
    }
    await this.routes.reorder(tenantId, routeId, dto.deliveryNoteIds);
    this.changed(tenantId, userId, 'delivery.route.reordered', routeId);
    return this.findOne(tenantId, routeId);
  }

  /** Saca la entrega de su ruta. Conserva la fecha y el turno programados. */
  async removeDelivery(tenantId: string, noteId: string, userId?: string) {
    const note = await this.plannableStop(tenantId, noteId);
    if (!note.routeId) {
      throw new UnprocessableEntityException(
        'Esta entrega no está en ninguna ruta',
      );
    }
    const changed = await this.routes.changePendingStop(tenantId, noteId, {
      ...OUT_OF_ROUTE,
      ...(await this.releaseFromRoute(tenantId, note)),
    });
    if (!changed) throw this.changedMeanwhile();

    this.changed(tenantId, userId, 'delivery.route.stop_removed', note.routeId);
    return { id: noteId };
  }

  /**
   * Programa la entrega para un día y turno (o la deja sin fecha). Si estaba
   * en una ruta de otro día u otro turno, sale de esa ruta.
   */
  async schedule(
    tenantId: string,
    noteId: string,
    dto: ScheduleDeliveryDto,
    userId?: string,
  ) {
    const note = await this.plannableStop(tenantId, noteId);
    const day = dto.date === null ? null : this.upcomingDay(dto.date);
    const shift = day
      ? dto.shift === undefined
        ? note.scheduledShift
        : dto.shift
      : null;

    let leaving: StopChange = {};
    if (note.routeId) {
      const route = await this.routes.findById(tenantId, note.routeId);
      const staysInRoute =
        route &&
        day?.getTime() === route.routeDate.getTime() &&
        shift === route.shift;
      if (!staysInRoute) {
        leaving = {
          ...OUT_OF_ROUTE,
          ...(route?.driverEmployeeId &&
          route.driverEmployeeId === note.assignedEmployeeId
            ? UNASSIGNED
            : {}),
        };
      }
    }

    const changed = await this.routes.changePendingStop(tenantId, noteId, {
      scheduledDate: day,
      scheduledShift: shift,
      ...leaving,
    });
    if (!changed) throw this.changedMeanwhile();

    this.changed(tenantId, userId, 'delivery.rescheduled', noteId);
    return { id: noteId, scheduledDate: toDay(day), scheduledShift: shift };
  }

  private async findOne(tenantId: string, id: string) {
    return toRoute(await this.routeOf(tenantId, id));
  }

  private async routeOf(tenantId: string, id: string) {
    const route = await this.routes.findById(tenantId, id);
    if (!route) throw new NotFoundException('Ruta no encontrada');
    return route;
  }

  private async driverOf(tenantId: string, employeeId: string) {
    const driver = await this.sources.findActiveCourier(tenantId, employeeId);
    if (!driver) throw new NotFoundException('Repartidor no encontrado');
    return driver;
  }

  /** La entrega, si todavía se puede planificar. */
  private async plannableStop(tenantId: string, noteId: string) {
    const note = await this.routes.findStop(tenantId, noteId);
    if (!note) throw new NotFoundException('Nota de entrega no encontrada');
    if (note.method !== 'HOME_DELIVERY') {
      throw new UnprocessableEntityException(
        note.method === 'PICKUP'
          ? 'Este pedido lo retira el cliente en la sucursal: no va en una ruta'
          : 'Este pedido lo lleva el vendedor: no va en una ruta',
      );
    }
    if (note.status !== 'PENDING') {
      throw new UnprocessableEntityException(
        'Solo se planifican entregas que todavía no salieron',
      );
    }
    return note;
  }

  /**
   * Al dejar una ruta con repartidor, la entrega pierde ese repartidor: se
   * lo había dado la ruta. Una asignación hecha a mano se respeta.
   */
  private async releaseFromRoute(
    tenantId: string,
    note: RouteStopRow,
    stayingInRouteId?: string,
  ): Promise<StopChange> {
    if (!note.routeId || note.routeId === stayingInRouteId) return {};
    const route = await this.routes.findById(tenantId, note.routeId);
    return route?.driverEmployeeId &&
      route.driverEmployeeId === note.assignedEmployeeId
      ? UNASSIGNED
      : {};
  }

  private dayOf(value: string): Date {
    const day = parseRouteDay(value);
    if (!day) throw new BadRequestException('La fecha no es un día válido');
    return day;
  }

  private upcomingDay(value: string): Date {
    const day = this.dayOf(value);
    this.assertNotPast(day);
    return day;
  }

  private assertNotPast(day: Date) {
    if (day.getTime() < startOfBusinessDay().getTime()) {
      throw new UnprocessableEntityException(
        'No se puede planificar para un día que ya pasó',
      );
    }
  }

  private changedMeanwhile() {
    return new ConflictException(
      'La entrega cambió mientras la planificabas. Actualizá la pantalla y volvé a intentar.',
    );
  }

  private changed(
    tenantId: string,
    userId: string | undefined,
    action: string,
    resourceId: string,
  ) {
    this.eventEmitter.emit('delivery.route.changed', { tenantId });
    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'logistics',
      action,
      resourceId,
    } satisfies AuditLogEvent);
  }
}
