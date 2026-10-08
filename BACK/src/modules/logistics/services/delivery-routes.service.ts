import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { AuditLogEvent } from '../../../audit/audit-log.event';
import { startOfBusinessDay } from '../../../common/utils/business-date.util';
import {
  FAILURE_REASONS,
  isSameStops,
  parseRouteDay,
  placeStop,
} from '../delivery-route.util';
import {
  AddRouteDeliveryDto,
  FailDeliveryDto,
  ListDeliveryRoutesDto,
  ReorderRouteDto,
  StartRouteDto,
  UpdateDeliveryRouteDto,
} from '../dto/delivery-route.dto';
import {
  DeliveryRoutesRepository,
  type RouteDetailRow,
  type RouteEventInput,
  type RouteListRow,
  type RouteRow,
  type RouteStopRow,
  type StopChange,
  type StopWithRouteRow,
} from '../repositories/delivery-routes.repository';
import { DeliveryTrackingEventsRepository } from '../repositories/delivery-tracking-events.repository';
import { LogisticsSourcesRepository } from '../repositories/logistics-sources.repository';

type Driver = { id: string; firstName: string; lastName: string };

/** Quién hace la acción. */
export interface RouteActor {
  userId: string;
  permissions: string[];
}

const DEFAULT_PAGE_LIMIT = 25;

const fullName = (person: { firstName: string; lastName: string }) =>
  `${person.firstName} ${person.lastName}`.trim();

// La entrega de una ruta va a nombre del repartidor de la ruta, así le
// aparece en "Mis entregas".
const assignedTo = (driver: Driver): StopChange => ({
  assignmentMode: 'INTERNAL_EMPLOYEE',
  assignedEmployeeId: driver.id,
  carrier: fullName(driver),
});

// Fuera de la ruta la entrega queda sin repartidor: se lo daba la ruta.
const OUT_OF_ROUTE: StopChange = {
  routeId: null,
  routeOrder: null,
  assignmentMode: null,
  assignedEmployeeId: null,
  carrier: null,
};

const toDay = (date: Date) => date.toISOString().slice(0, 10);

const toNumber = (value: unknown) =>
  value === null || value === undefined ? null : Number(value);

const customerName = (row: RouteStopRow) => fullName(row.saleOrder.customer);

function toStop(row: RouteStopRow) {
  const { customer, items } = row.saleOrder;
  return {
    id: row.id,
    noteNumber: row.noteNumber,
    status: row.status,
    routeId: row.routeId,
    deliveredAt: row.deliveredAt,
    saleOrderId: row.saleOrder.id,
    units: items.reduce((sum, item) => sum + Number(item.quantity), 0),
    items: items.map((item) => ({
      name: item.product?.name ?? 'Producto',
      quantity: Number(item.quantity),
    })),
    customer: {
      id: customer.id,
      name: fullName(customer),
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

function toSummary(row: RouteListRow | RouteRow) {
  return {
    id: row.id,
    code: row.code,
    date: toDay(row.routeDate),
    status: row.status,
    vehicle: row.vehicle,
    driver: row.driver,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    createdAt: row.createdAt,
  };
}

function toListed(row: RouteListRow) {
  return {
    ...toSummary(row),
    stops: row.deliveries.length,
    delivered: row.deliveries.filter((stop) => stop.status === 'DELIVERED')
      .length,
  };
}

function toRoute(row: RouteRow) {
  return { ...toSummary(row), stops: row.deliveries.map(toStop) };
}

function toDetail(row: RouteDetailRow) {
  return {
    ...toRoute(row),
    events: row.events.map((event) => ({
      id: event.id,
      type: event.type,
      detail: event.detail,
      reason: event.reason,
      latitude: toNumber(event.latitude),
      longitude: toNumber(event.longitude),
      createdAt: event.createdAt,
      user: event.user,
    })),
  };
}

@Injectable()
export class DeliveryRoutesService {
  constructor(
    private readonly routes: DeliveryRoutesRepository,
    private readonly sources: LogisticsSourcesRepository,
    private readonly trackingEvents: DeliveryTrackingEventsRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async list(tenantId: string, query: ListDeliveryRoutesDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? DEFAULT_PAGE_LIMIT;
    const [rows, total] = await this.routes.findPage(
      tenantId,
      {
        status: query.status,
        driverEmployeeId: query.driverEmployeeId,
        from: query.from ? this.dayOf(query.from) : undefined,
        to: query.to ? this.dayOf(query.to) : undefined,
      },
      { skip: (page - 1) * limit, take: limit },
    );
    return {
      items: rows.map(toListed),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async findOne(tenantId: string, id: string) {
    const route = await this.routes.findDetail(tenantId, id);
    if (!route) throw new NotFoundException('Ruta no encontrada');
    return toDetail(route);
  }

  /** Las rutas que el repartidor tiene por hacer o está haciendo. */
  async findMine(tenantId: string, userId: string) {
    const employee = await this.sources.findEmployeeByUser(tenantId, userId);
    if (!employee) return [];
    const routes = await this.routes.findActiveForDriver(tenantId, employee.id);
    return routes.map(toRoute);
  }

  /** Entregas a domicilio pendientes que todavía no están en ninguna ruta. */
  async findUnplanned(tenantId: string) {
    return (await this.routes.findUnplanned(tenantId)).map(toStop);
  }

  /**
   * Asignar una entrega a un repartidor la pone en su ruta de ese día; si no
   * tiene una, se crea. `date` sin valor es hoy.
   */
  async assignToDriver(
    tenantId: string,
    noteId: string,
    driver: Driver,
    options: { date?: string; userId?: string },
  ) {
    const note = await this.plannableStop(tenantId, noteId);
    const day = options.date
      ? this.upcomingDay(options.date)
      : startOfBusinessDay();

    const current = note.route;
    if (
      current &&
      current.driverEmployeeId === driver.id &&
      current.routeDate.getTime() === day.getTime()
    ) {
      return { id: current.id, code: current.code };
    }

    const route =
      (await this.routes.findJoinable(tenantId, driver.id, day)) ??
      (await this.routes.create({
        tenantId,
        routeDate: day,
        driverEmployeeId: driver.id,
        createdById: options.userId,
      }));
    await this.place(tenantId, route, driver, note, undefined, options.userId);
    return { id: route.id, code: route.code };
  }

  /** Suma una entrega a esta ruta, o la trae desde otra. */
  async addDelivery(
    tenantId: string,
    routeId: string,
    dto: AddRouteDeliveryDto,
    userId?: string,
  ) {
    const route = await this.routeOf(tenantId, routeId);
    if (route.status !== 'OPEN' && route.status !== 'IN_PROGRESS') {
      throw new UnprocessableEntityException(
        'Esta ruta ya terminó: no se le pueden sumar entregas',
      );
    }
    if (!route.driver) {
      throw new UnprocessableEntityException(
        'La ruta no tiene repartidor: asignale uno antes de sumarle entregas',
      );
    }
    const note = await this.plannableStop(tenantId, dto.deliveryNoteId);
    await this.place(tenantId, route, route.driver, note, dto.position, userId);
    return this.findOne(tenantId, routeId);
  }

  async reorder(
    tenantId: string,
    routeId: string,
    dto: ReorderRouteDto,
    userId?: string,
  ) {
    const route = await this.routeOf(tenantId, routeId);
    if (route.status !== 'OPEN' && route.status !== 'IN_PROGRESS') {
      throw new UnprocessableEntityException(
        'Esta ruta ya terminó: no se puede reordenar',
      );
    }
    const current = route.deliveries.map((stop) => stop.id);
    if (!isSameStops(current, dto.deliveryNoteIds)) {
      throw new ConflictException(
        'La ruta cambió mientras la ordenabas. Actualizá la pantalla y volvé a intentar.',
      );
    }
    await this.routes.reorder(tenantId, routeId, dto.deliveryNoteIds, [
      { routeId, type: 'REORDERED', userId },
    ]);
    this.changed(tenantId, userId, 'delivery.route.reordered', routeId);
    return this.findOne(tenantId, routeId);
  }

  /** Saca de la ruta una entrega que todavía no salió. */
  async removeDelivery(tenantId: string, noteId: string, userId?: string) {
    const note = await this.stopOf(tenantId, noteId);
    if (!note.route) {
      throw new UnprocessableEntityException(
        'Esta entrega no está en ninguna ruta',
      );
    }
    if (note.status !== 'PENDING' || note.route.status !== 'OPEN') {
      throw new UnprocessableEntityException(
        'La entrega ya salió con su ruta. Si no se pudo entregar, registralo como entrega no realizada.',
      );
    }
    const released = await this.routes.releaseStop(
      tenantId,
      noteId,
      { status: 'PENDING', routeId: note.route.id },
      OUT_OF_ROUTE,
      [
        {
          routeId: note.route.id,
          type: 'STOP_REMOVED',
          deliveryNoteId: noteId,
          detail: customerName(note),
          userId,
        },
      ],
    );
    if (!released) throw this.changedMeanwhile();

    this.changed(
      tenantId,
      userId,
      'delivery.route.stop_removed',
      note.route.id,
    );
    return { id: noteId };
  }

  /**
   * El repartidor (o logística) deja asentado que no pudo entregar. La
   * entrega vuelve a pendiente, sin ruta, para reasignarla.
   */
  async failDelivery(
    tenantId: string,
    noteId: string,
    dto: FailDeliveryDto,
    actor: RouteActor,
  ) {
    const note = await this.stopOf(tenantId, noteId);
    if (!note.route || note.route.status !== 'IN_PROGRESS') {
      throw new UnprocessableEntityException(
        'Esta entrega no está en una ruta en curso',
      );
    }
    await this.assertDriverOrManager(
      tenantId,
      note.route.driverEmployeeId,
      actor,
    );
    if (note.status !== 'DISPATCHED') {
      throw new UnprocessableEntityException(
        'Solo se registra como no realizada una entrega que está en camino',
      );
    }

    const reason = FAILURE_REASONS[dto.reason];
    const detail = dto.note?.trim();
    const released = await this.routes.releaseStop(
      tenantId,
      noteId,
      { status: 'DISPATCHED', routeId: note.route.id },
      { ...OUT_OF_ROUTE, status: 'PENDING' },
      [
        {
          routeId: note.route.id,
          type: 'STOP_FAILED',
          deliveryNoteId: noteId,
          detail: customerName(note),
          reason: detail ? `${reason}. ${detail}` : reason,
          latitude: dto.latitude,
          longitude: dto.longitude,
          userId: actor.userId,
        },
      ],
    );
    if (!released) throw this.changedMeanwhile();

    // También en el recorrido de la propia entrega: el intento queda aunque
    // después salga en otra ruta.
    await this.trackingEvents.create(tenantId, {
      deliveryNoteId: noteId,
      source: 'MANUAL',
      latitude: dto.latitude,
      longitude: dto.longitude,
      notes: `No se pudo entregar (ruta ${note.route.code}): ${
        detail ? `${reason}. ${detail}` : reason
      }`,
      recordedById: actor.userId,
    });

    await this.completeIfDone(tenantId, note.route.id);
    this.changed(
      tenantId,
      actor.userId,
      'delivery.route.stop_failed',
      note.route.id,
    );
    return { id: noteId };
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateDeliveryRouteDto,
    userId?: string,
  ) {
    const route = await this.routeOf(tenantId, id);
    const events: RouteEventInput[] = [];
    let pendingStops: StopChange | undefined;
    const data: Parameters<DeliveryRoutesRepository['update']>[3] = {};

    const changesPlan =
      (dto.driverEmployeeId !== undefined &&
        dto.driverEmployeeId !== route.driverEmployeeId) ||
      (dto.date !== undefined && dto.date !== toDay(route.routeDate));
    if (changesPlan && route.status !== 'OPEN') {
      throw new UnprocessableEntityException(
        'El repartidor y la fecha solo se cambian antes de que la ruta salga',
      );
    }

    if (
      dto.driverEmployeeId !== undefined &&
      dto.driverEmployeeId !== route.driverEmployeeId
    ) {
      const driver = await this.driverOf(tenantId, dto.driverEmployeeId);
      data.driverEmployeeId = driver.id;
      pendingStops = assignedTo(driver);
      events.push({
        routeId: id,
        type: 'DRIVER_CHANGED',
        detail: route.driver
          ? `De ${fullName(route.driver)} a ${fullName(driver)}`
          : fullName(driver),
        userId,
      });
    }
    if (dto.date !== undefined && dto.date !== toDay(route.routeDate)) {
      data.routeDate = this.upcomingDay(dto.date);
      events.push({
        routeId: id,
        type: 'DATE_CHANGED',
        detail: `Del ${toDay(route.routeDate)} al ${dto.date}`,
        userId,
      });
    }
    if (dto.vehicle !== undefined) {
      data.vehicle = dto.vehicle.trim() || null;
    }

    const updated = await this.routes.update(
      tenantId,
      id,
      changesPlan ? ['OPEN'] : ['OPEN', 'IN_PROGRESS'],
      data,
      pendingStops,
      events,
    );
    if (!updated) {
      throw new ConflictException(
        'La ruta cambió de estado mientras la editabas. Actualizá la pantalla.',
      );
    }
    this.changed(tenantId, userId, 'delivery.route.updated', id);
    return this.findOne(tenantId, id);
  }

  /** La ruta sale: todas sus entregas pendientes quedan en camino. */
  async start(
    tenantId: string,
    id: string,
    dto: StartRouteDto,
    actor: RouteActor,
  ) {
    const route = await this.routeOf(tenantId, id);
    await this.assertDriverOrManager(tenantId, route.driverEmployeeId, actor);
    if (route.status !== 'OPEN') {
      throw new UnprocessableEntityException(
        route.status === 'IN_PROGRESS'
          ? 'Esta ruta ya está en curso'
          : 'Esta ruta ya terminó',
      );
    }
    if (!route.driver) {
      throw new UnprocessableEntityException(
        'La ruta no tiene repartidor: asignale uno antes de iniciarla',
      );
    }
    if (route.deliveries.length === 0) {
      throw new UnprocessableEntityException(
        'La ruta no tiene entregas para llevar',
      );
    }
    if (route.routeDate.getTime() > startOfBusinessDay().getTime()) {
      throw new UnprocessableEntityException(
        'Esta ruta está armada para otro día. Cambiale la fecha si sale hoy.',
      );
    }

    const vehicle = dto.vehicle?.trim() || route.vehicle || undefined;
    const leaving = await this.routes.start(
      tenantId,
      id,
      { status: 'DISPATCHED', vehicle },
      { vehicle },
      [{ routeId: id, type: 'STARTED', userId: actor.userId }],
    );
    if (!leaving) {
      throw new ConflictException(
        'La ruta cambió de estado mientras la iniciabas. Actualizá la pantalla.',
      );
    }

    for (const stop of leaving) {
      this.eventEmitter.emit('delivery.dispatched', {
        tenantId,
        saleOrderId: stop.saleOrderId,
        deliveryNoteId: stop.id,
      });
    }
    this.changed(tenantId, actor.userId, 'delivery.route.started', id);
    return this.findOne(tenantId, id);
  }

  /** Cancela una ruta que no salió; sus entregas quedan sin ruta. */
  async cancel(tenantId: string, id: string, userId?: string) {
    await this.routeOf(tenantId, id);
    const cancelled = await this.routes.cancel(tenantId, id, OUT_OF_ROUTE, [
      { routeId: id, type: 'CANCELLED', userId },
    ]);
    if (!cancelled) {
      throw new ConflictException(
        'Solo se cancela una ruta que todavía no salió',
      );
    }
    this.changed(tenantId, userId, 'delivery.route.cancelled', id);
    return this.findOne(tenantId, id);
  }

  /** Una entrega quedó entregada: se asienta en su ruta y, si era la última, la ruta se cierra. */
  async stopDelivered(tenantId: string, noteId: string, userId?: string) {
    const note = await this.routes.findStop(tenantId, noteId);
    if (!note?.route) return;
    await this.routes.addEvents(tenantId, [
      {
        routeId: note.route.id,
        type: 'STOP_DELIVERED',
        deliveryNoteId: noteId,
        detail: customerName(note),
        userId,
      },
    ]);
    await this.completeIfDone(tenantId, note.route.id);
    this.eventEmitter.emit('delivery.route.changed', { tenantId });
  }

  private async place(
    tenantId: string,
    route: RouteRow,
    driver: Driver,
    note: StopWithRouteRow,
    position: number | undefined,
    userId: string | undefined,
  ) {
    this.assertNotPast(route.routeDate);
    // Una ruta que ya está en la calle se lleva la entrega en el acto.
    const onTheRoad = route.status === 'IN_PROGRESS';
    const moving = note.route && note.route.id !== route.id ? note.route : null;
    if (moving && moving.status !== 'OPEN') {
      throw new UnprocessableEntityException(
        `Esta entrega ya salió con la ruta ${moving.code}`,
      );
    }

    const detail = customerName(note);
    const placed = await this.routes.placeStop(
      tenantId,
      route.id,
      note.id,
      {
        ...assignedTo(driver),
        ...(onTheRoad && {
          status: 'DISPATCHED',
          vehicle: route.vehicle ?? undefined,
        }),
      },
      placeStop(
        route.deliveries.map((stop) => stop.id),
        note.id,
        position,
      ),
      [
        ...(moving
          ? [
              {
                routeId: moving.id,
                type: 'STOP_REMOVED' as const,
                deliveryNoteId: note.id,
                detail: `${detail} (pasó a la ruta ${route.code})`,
                userId,
              },
            ]
          : []),
        {
          routeId: route.id,
          type: 'STOP_ADDED',
          deliveryNoteId: note.id,
          detail,
          userId,
        },
      ],
    );
    if (!placed) throw this.changedMeanwhile();

    if (onTheRoad) {
      this.eventEmitter.emit('delivery.dispatched', {
        tenantId,
        saleOrderId: note.saleOrder.id,
        deliveryNoteId: note.id,
      });
    }
    this.changed(tenantId, userId, 'delivery.route.stop_added', route.id);
  }

  private async completeIfDone(tenantId: string, routeId: string) {
    await this.routes.completeIfDone(tenantId, routeId, [
      { routeId, type: 'COMPLETED' },
    ]);
  }

  private async routeOf(tenantId: string, id: string) {
    const route = await this.routes.findById(tenantId, id);
    if (!route) throw new NotFoundException('Ruta no encontrada');
    return route;
  }

  private async stopOf(tenantId: string, noteId: string) {
    const note = await this.routes.findStop(tenantId, noteId);
    if (!note) throw new NotFoundException('Nota de entrega no encontrada');
    return note;
  }

  private async driverOf(tenantId: string, employeeId: string) {
    const driver = await this.sources.findActiveCourier(tenantId, employeeId);
    if (!driver) throw new NotFoundException('Repartidor no encontrado');
    return driver;
  }

  /** La entrega, si todavía puede entrar en una ruta. */
  private async plannableStop(tenantId: string, noteId: string) {
    const note = await this.stopOf(tenantId, noteId);
    if (note.method !== 'HOME_DELIVERY') {
      throw new UnprocessableEntityException(
        note.method === 'PICKUP'
          ? 'Este pedido lo retira el cliente en la sucursal: no va en una ruta'
          : 'Este pedido lo lleva el vendedor: no va en una ruta',
      );
    }
    if (note.status !== 'PENDING') {
      throw new UnprocessableEntityException(
        note.route
          ? `Esta entrega ya salió con la ruta ${note.route.code}`
          : 'Solo entran en una ruta las entregas que todavía no salieron',
      );
    }
    return note;
  }

  // Iniciar la ruta y registrar una entrega no realizada los hace logística
  // o el repartidor de esa ruta.
  private async assertDriverOrManager(
    tenantId: string,
    driverEmployeeId: string | null,
    actor: RouteActor,
  ) {
    if (actor.permissions.includes('logistics:manage')) return;
    if (!actor.permissions.includes('logistics:track')) {
      throw new ForbiddenException('No tenés permiso sobre esta ruta');
    }
    const employee = await this.sources.findEmployeeByUser(
      tenantId,
      actor.userId,
    );
    if (!employee || employee.id !== driverEmployeeId) {
      throw new ForbiddenException('Esta ruta no está asignada a vos');
    }
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
        'No se puede armar una ruta para un día que ya pasó',
      );
    }
  }

  private changedMeanwhile() {
    return new ConflictException(
      'La entrega cambió mientras la movías. Actualizá la pantalla y volvé a intentar.',
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
