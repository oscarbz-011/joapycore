import { Injectable } from '@nestjs/common';
import {
  DeliveryCheckpoint,
  DeliveryRouteEventType,
  DeliveryRouteStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { nextRouteCode } from '../delivery-route.util';

const PERSON = { id: true, firstName: true, lastName: true } as const;

// Lo que una ruta necesita de cada entrega: a quién, dónde, qué lleva y en
// qué lugar del recorrido.
const stop = {
  id: true,
  noteNumber: true,
  status: true,
  method: true,
  routeId: true,
  routeOrder: true,
  assignedEmployeeId: true,
  deliveredAt: true,
  createdAt: true,
  saleOrder: {
    select: {
      id: true,
      customer: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          address: true,
          city: true,
          homeStreet: true,
          homeNeighborhood: true,
          homeReference: true,
          latitude: true,
          longitude: true,
        },
      },
      items: {
        select: { quantity: true, product: { select: { name: true } } },
      },
    },
  },
} satisfies Prisma.DeliveryNoteSelect;

const summary = {
  id: true,
  code: true,
  routeDate: true,
  status: true,
  vehicle: true,
  driverEmployeeId: true,
  startedAt: true,
  finishedAt: true,
  createdAt: true,
  driver: { select: PERSON },
} satisfies Prisma.DeliveryRouteSelect;

const listed = {
  ...summary,
  deliveries: { select: { status: true } },
} satisfies Prisma.DeliveryRouteSelect;

const withStops = {
  ...summary,
  deliveries: {
    select: stop,
    orderBy: [{ routeOrder: 'asc' }, { createdAt: 'asc' }],
  },
} satisfies Prisma.DeliveryRouteSelect;

const detailed = {
  ...withStops,
  events: {
    select: {
      id: true,
      type: true,
      detail: true,
      reason: true,
      latitude: true,
      longitude: true,
      createdAt: true,
      user: { select: PERSON },
    },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.DeliveryRouteSelect;

const stopWithRoute = {
  ...stop,
  route: {
    select: {
      id: true,
      code: true,
      status: true,
      routeDate: true,
      driverEmployeeId: true,
    },
  },
} satisfies Prisma.DeliveryNoteSelect;

export type RouteStopRow = Prisma.DeliveryNoteGetPayload<{
  select: typeof stop;
}>;
export type StopWithRouteRow = Prisma.DeliveryNoteGetPayload<{
  select: typeof stopWithRoute;
}>;
export type RouteListRow = Prisma.DeliveryRouteGetPayload<{
  select: typeof listed;
}>;
export type RouteRow = Prisma.DeliveryRouteGetPayload<{
  select: typeof withStops;
}>;
export type RouteDetailRow = Prisma.DeliveryRouteGetPayload<{
  select: typeof detailed;
}>;

/** Qué cambia en una entrega al entrar o salir de una ruta. */
export type StopChange = Pick<
  Prisma.DeliveryNoteUncheckedUpdateManyInput,
  | 'status'
  | 'routeId'
  | 'routeOrder'
  | 'assignmentMode'
  | 'assignedEmployeeId'
  | 'carrier'
  | 'vehicle'
>;

/** Un renglón del historial de una ruta. */
export interface RouteEventInput {
  routeId: string;
  type: DeliveryRouteEventType;
  deliveryNoteId?: string;
  detail?: string;
  reason?: string;
  latitude?: number;
  longitude?: number;
  userId?: string;
}

export interface RouteFilter {
  status?: DeliveryRouteStatus;
  driverEmployeeId?: string;
  from?: Date;
  to?: Date;
}

// Solo entra en una ruta lo que todavía no salió y va a domicilio.
const PLANNABLE = { status: 'PENDING', method: 'HOME_DELIVERY' } as const;

// Tope de entregas sin ruta que se ofrecen para sumar.
const UNPLANNED_LIMIT = 300;

// Dos rutas creadas a la vez piden el mismo código: se reintenta con el siguiente.
const CODE_ATTEMPTS = 5;

const isDuplicate = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === 'P2002';

@Injectable()
export class DeliveryRoutesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findPage(
    tenantId: string,
    filter: RouteFilter,
    window: { skip: number; take: number },
  ): Promise<[RouteListRow[], number]> {
    const where: Prisma.DeliveryRouteWhereInput = {
      tenantId,
      ...(filter.status && { status: filter.status }),
      ...(filter.driverEmployeeId && {
        driverEmployeeId: filter.driverEmployeeId,
      }),
      ...((filter.from || filter.to) && {
        routeDate: { gte: filter.from, lte: filter.to },
      }),
    };
    return this.prisma.$transaction([
      this.prisma.deliveryRoute.findMany({
        where,
        select: listed,
        // El id desempata: el orden de las páginas no puede cambiar entre pedidos.
        orderBy: [{ routeDate: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
        skip: window.skip,
        take: window.take,
      }),
      this.prisma.deliveryRoute.count({ where }),
    ]);
  }

  findById(tenantId: string, id: string) {
    return this.prisma.deliveryRoute.findFirst({
      where: { id, tenantId },
      select: withStops,
    });
  }

  findDetail(tenantId: string, id: string) {
    return this.prisma.deliveryRoute.findFirst({
      where: { id, tenantId },
      select: detailed,
    });
  }

  /** Las rutas que el repartidor tiene por hacer o está haciendo. */
  findActiveForDriver(tenantId: string, driverEmployeeId: string) {
    return this.prisma.deliveryRoute.findMany({
      where: {
        tenantId,
        driverEmployeeId,
        status: { in: ['OPEN', 'IN_PROGRESS'] },
      },
      select: withStops,
      orderBy: [{ routeDate: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * La ruta del repartidor para ese día a la que se puede sumar una entrega:
   * la que todavía no salió y, si no hay, la que está en la calle.
   */
  findJoinable(tenantId: string, driverEmployeeId: string, routeDate: Date) {
    return this.prisma.deliveryRoute.findFirst({
      where: {
        tenantId,
        driverEmployeeId,
        routeDate,
        status: { in: ['OPEN', 'IN_PROGRESS'] },
      },
      select: withStops,
      // OPEN antes que IN_PROGRESS.
      orderBy: [
        { startedAt: { sort: 'asc', nulls: 'first' } },
        { createdAt: 'asc' },
      ],
    });
  }

  /** Entregas a domicilio pendientes que todavía no están en ninguna ruta. */
  findUnplanned(tenantId: string) {
    return this.prisma.deliveryNote.findMany({
      where: { tenantId, routeId: null, ...PLANNABLE },
      select: stop,
      orderBy: { createdAt: 'asc' },
      take: UNPLANNED_LIMIT,
    });
  }

  /** Los pedidos de un cliente que están en camino en la ruta. */
  findCustomerStopsOnTheWay(
    tenantId: string,
    routeId: string,
    customerId: string,
  ) {
    return this.prisma.deliveryNote.findMany({
      where: {
        tenantId,
        routeId,
        status: 'DISPATCHED',
        saleOrder: { customerId },
      },
      select: {
        id: true,
        trackingEvents: { select: { checkpoint: true } },
      },
      orderBy: [{ routeOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  findStop(tenantId: string, id: string) {
    return this.prisma.deliveryNote.findFirst({
      where: { id, tenantId },
      select: stopWithRoute,
    });
  }

  /** Crea la ruta con el código que sigue y deja asentado quién la creó. */
  async create(data: {
    tenantId: string;
    routeDate: Date;
    driverEmployeeId: string;
    createdById?: string;
  }): Promise<RouteRow> {
    for (let attempt = 1; ; attempt += 1) {
      const last = await this.prisma.deliveryRoute.findFirst({
        where: { tenantId: data.tenantId, code: { startsWith: 'RUT-' } },
        // El correlativo no se reinicia con el año: manda el número, no el prefijo.
        orderBy: { createdAt: 'desc' },
        select: { code: true },
      });
      try {
        return await this.prisma.deliveryRoute.create({
          data: {
            ...data,
            code: nextRouteCode(last?.code ?? null, new Date()),
            events: {
              create: {
                tenantId: data.tenantId,
                type: 'CREATED',
                userId: data.createdById,
              },
            },
          },
          select: withStops,
        });
      } catch (error) {
        if (!isDuplicate(error) || attempt >= CODE_ATTEMPTS) throw error;
      }
    }
  }

  /**
   * Pone una entrega en la ruta y renumera el recorrido. Devuelve false, sin
   * tocar nada, si la entrega dejó de estar pendiente entre la lectura y la
   * escritura (la despacharon o pasó a retiro en sucursal).
   */
  placeStop(
    tenantId: string,
    routeId: string,
    noteId: string,
    change: StopChange,
    orderedIds: string[],
    events: RouteEventInput[],
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.deliveryNote.updateMany({
        where: { id: noteId, tenantId, ...PLANNABLE },
        data: { ...change, routeId },
      });
      if (count !== 1) return false;
      await this.renumber(tx, tenantId, routeId, orderedIds);
      await this.record(tx, tenantId, events);
      return true;
    });
  }

  reorder(
    tenantId: string,
    routeId: string,
    orderedIds: string[],
    events: RouteEventInput[],
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.renumber(tx, tenantId, routeId, orderedIds);
      await this.record(tx, tenantId, events);
    });
  }

  /**
   * Saca una entrega de su ruta mientras siga en el estado esperado. False si
   * otro la cambió antes.
   */
  releaseStop(
    tenantId: string,
    noteId: string,
    whileIs: { status: 'PENDING' | 'DISPATCHED'; routeId: string },
    change: StopChange,
    events: RouteEventInput[],
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.deliveryNote.updateMany({
        where: { id: noteId, tenantId, ...whileIs },
        data: change,
      });
      if (count !== 1) return false;
      await this.record(tx, tenantId, events);
      return true;
    });
  }

  /**
   * Cambia datos de una ruta que sigue en uno de los estados dados y, si hace
   * falta, se los pasa a las entregas que todavía no salieron.
   */
  update(
    tenantId: string,
    id: string,
    whileIn: DeliveryRouteStatus[],
    data: Pick<
      Prisma.DeliveryRouteUncheckedUpdateManyInput,
      'driverEmployeeId' | 'vehicle' | 'routeDate'
    >,
    pendingStops: StopChange | undefined,
    events: RouteEventInput[],
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.deliveryRoute.updateMany({
        where: { id, tenantId, status: { in: whileIn } },
        data,
      });
      if (count !== 1) return false;
      if (pendingStops) {
        await tx.deliveryNote.updateMany({
          where: { tenantId, routeId: id, status: 'PENDING' },
          data: pendingStops,
        });
      }
      await this.record(tx, tenantId, events);
      return true;
    });
  }

  /**
   * La ruta sale: pasa a "en curso" y todas sus entregas pendientes quedan
   * despachadas. Devuelve las entregas que salieron, o null si la ruta ya no
   * estaba abierta.
   */
  start(
    tenantId: string,
    id: string,
    stops: StopChange,
    route: Pick<Prisma.DeliveryRouteUncheckedUpdateManyInput, 'vehicle'>,
    events: RouteEventInput[],
    userId?: string,
  ): Promise<{ id: string; saleOrderId: string }[] | null> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.deliveryRoute.updateMany({
        where: { id, tenantId, status: 'OPEN' },
        data: { ...route, status: 'IN_PROGRESS', startedAt: new Date() },
      });
      if (count !== 1) return null;
      const leaving = await tx.deliveryNote.findMany({
        where: { tenantId, routeId: id, status: 'PENDING' },
        select: { id: true, saleOrderId: true },
      });
      await tx.deliveryNote.updateMany({
        where: { tenantId, routeId: id, status: 'PENDING' },
        data: stops,
      });
      // Iniciar la ruta es salir del depósito: queda en el recorrido de
      // cada entrega sin que el repartidor lo marque una por una.
      await tx.deliveryTrackingEvent.createMany({
        data: leaving.map((note) => ({
          tenantId,
          deliveryNoteId: note.id,
          source: 'MANUAL' as const,
          checkpoint: 'LEFT_WAREHOUSE' as const,
          recordedById: userId,
        })),
      });
      await this.record(tx, tenantId, events);
      return leaving;
    });
  }

  /**
   * Marca un hito en todas las entregas de la ruta que están en camino y
   * todavía no lo tienen. Devuelve a cuántas se lo marcó.
   */
  markCheckpoint(
    tenantId: string,
    id: string,
    checkpoint: DeliveryCheckpoint,
    userId: string | undefined,
    events: RouteEventInput[],
  ): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const missing = await tx.deliveryNote.findMany({
        where: {
          tenantId,
          routeId: id,
          status: 'DISPATCHED',
          trackingEvents: { none: { checkpoint } },
        },
        select: { id: true },
      });
      if (missing.length === 0) return 0;
      await tx.deliveryTrackingEvent.createMany({
        data: missing.map((note) => ({
          tenantId,
          deliveryNoteId: note.id,
          source: 'MANUAL' as const,
          checkpoint,
          recordedById: userId,
        })),
      });
      await this.record(tx, tenantId, events);
      return missing.length;
    });
  }

  /** Cancela una ruta que no salió y deja sus entregas sin ruta. */
  cancel(
    tenantId: string,
    id: string,
    release: StopChange,
    events: RouteEventInput[],
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.deliveryRoute.updateMany({
        where: { id, tenantId, status: 'OPEN' },
        data: { status: 'CANCELLED', finishedAt: new Date() },
      });
      if (count !== 1) return false;
      await tx.deliveryNote.updateMany({
        where: { tenantId, routeId: id },
        data: release,
      });
      await this.record(tx, tenantId, events);
      return true;
    });
  }

  /**
   * Cierra una ruta en curso si ya no le queda ninguna parada por resolver.
   * True si la cerró.
   */
  completeIfDone(
    tenantId: string,
    id: string,
    events: RouteEventInput[],
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const open = await tx.deliveryNote.count({
        where: {
          tenantId,
          routeId: id,
          status: { in: ['PENDING', 'DISPATCHED'] },
        },
      });
      if (open > 0) return false;
      const { count } = await tx.deliveryRoute.updateMany({
        where: { id, tenantId, status: 'IN_PROGRESS' },
        data: { status: 'COMPLETED', finishedAt: new Date() },
      });
      if (count !== 1) return false;
      await this.record(tx, tenantId, events);
      return true;
    });
  }

  addEvents(tenantId: string, events: RouteEventInput[]) {
    return this.record(this.prisma, tenantId, events);
  }

  private async record(
    client: Prisma.TransactionClient,
    tenantId: string,
    events: RouteEventInput[],
  ) {
    if (events.length === 0) return;
    await client.deliveryRouteEvent.createMany({
      data: events.map((event) => ({ ...event, tenantId })),
    });
  }

  private async renumber(
    tx: Prisma.TransactionClient,
    tenantId: string,
    routeId: string,
    orderedIds: string[],
  ) {
    for (const [index, id] of orderedIds.entries()) {
      await tx.deliveryNote.updateMany({
        where: { id, tenantId, routeId },
        data: { routeOrder: index },
      });
    }
  }
}
