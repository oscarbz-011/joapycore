import { Injectable } from '@nestjs/common';
import { DeliveryShift, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

// Lo que la planificación necesita de cada entrega: a quién, dónde y en qué
// lugar del recorrido.
const stop = {
  id: true,
  noteNumber: true,
  status: true,
  method: true,
  routeId: true,
  routeOrder: true,
  scheduledDate: true,
  scheduledShift: true,
  assignedEmployeeId: true,
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
      items: { select: { quantity: true } },
    },
  },
} satisfies Prisma.DeliveryNoteSelect;

const route = {
  id: true,
  routeDate: true,
  shift: true,
  name: true,
  vehicle: true,
  notes: true,
  driverEmployeeId: true,
  driver: { select: { id: true, firstName: true, lastName: true } },
  deliveries: {
    select: stop,
    orderBy: [{ routeOrder: 'asc' }, { createdAt: 'asc' }],
  },
} satisfies Prisma.DeliveryRouteSelect;

export type RouteStopRow = Prisma.DeliveryNoteGetPayload<{
  select: typeof stop;
}>;
export type RouteRow = Prisma.DeliveryRouteGetPayload<{ select: typeof route }>;

/** Qué cambia en una entrega al entrar o salir de una ruta. */
export type StopChange = Pick<
  Prisma.DeliveryNoteUncheckedUpdateManyInput,
  | 'routeId'
  | 'routeOrder'
  | 'scheduledDate'
  | 'scheduledShift'
  | 'assignmentMode'
  | 'assignedEmployeeId'
  | 'carrier'
>;

// Solo se planifica lo que todavía no salió y va a domicilio.
const PLANNABLE = { status: 'PENDING', method: 'HOME_DELIVERY' } as const;

// Tope de entregas sin ruta que se muestran para planificar.
const UNPLANNED_LIMIT = 300;

@Injectable()
export class DeliveryRoutesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findForDay(tenantId: string, routeDate: Date) {
    return this.prisma.deliveryRoute.findMany({
      where: { tenantId, routeDate },
      select: route,
      orderBy: [{ shift: 'asc' }, { createdAt: 'asc' }],
    });
  }

  findById(tenantId: string, id: string) {
    return this.prisma.deliveryRoute.findFirst({
      where: { id, tenantId },
      select: route,
    });
  }

  /** Entregas a domicilio pendientes que todavía no están en ninguna ruta. */
  findUnplanned(tenantId: string) {
    return this.prisma.deliveryNote.findMany({
      where: { tenantId, routeId: null, ...PLANNABLE },
      select: stop,
      orderBy: [
        { scheduledDate: { sort: 'asc', nulls: 'last' } },
        { createdAt: 'asc' },
      ],
      take: UNPLANNED_LIMIT,
    });
  }

  findStop(tenantId: string, id: string) {
    return this.prisma.deliveryNote.findFirst({
      where: { id, tenantId },
      select: stop,
    });
  }

  create(data: {
    tenantId: string;
    routeDate: Date;
    shift: DeliveryShift;
    driverEmployeeId?: string;
    vehicle?: string;
    name?: string;
    createdById?: string;
  }) {
    return this.prisma.deliveryRoute.create({ data, select: { id: true } });
  }

  /**
   * Cambia los datos de la ruta y, si cambió el repartidor, se lo pasa a las
   * entregas que todavía no salieron.
   */
  update(
    tenantId: string,
    id: string,
    data: Pick<
      Prisma.DeliveryRouteUncheckedUpdateManyInput,
      'driverEmployeeId' | 'vehicle' | 'name'
    >,
    pendingStops?: StopChange,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.deliveryRoute.updateMany({
        where: { id, tenantId },
        data,
      });
      if (count === 1 && pendingStops) {
        await tx.deliveryNote.updateMany({
          where: { tenantId, routeId: id, status: 'PENDING' },
          data: pendingStops,
        });
      }
      return count;
    });
  }

  /**
   * Pone una entrega en la ruta y renumera el recorrido. Devuelve false, sin
   * tocar nada, si la entrega dejó de ser planificable entre la lectura y la
   * escritura (la despacharon o pasó a retiro en sucursal).
   */
  placeStop(
    tenantId: string,
    routeId: string,
    noteId: string,
    change: StopChange,
    orderedIds: string[],
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.deliveryNote.updateMany({
        where: { id: noteId, tenantId, ...PLANNABLE },
        data: { ...change, routeId },
      });
      if (count !== 1) return false;
      await this.renumber(tx, tenantId, routeId, orderedIds);
      return true;
    });
  }

  reorder(tenantId: string, routeId: string, orderedIds: string[]) {
    return this.prisma.$transaction((tx) =>
      this.renumber(tx, tenantId, routeId, orderedIds),
    );
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

  /** Saca una entrega pendiente de su ruta o le cambia la programación. */
  async changePendingStop(
    tenantId: string,
    noteId: string,
    change: StopChange,
  ): Promise<boolean> {
    const { count } = await this.prisma.deliveryNote.updateMany({
      where: { id: noteId, tenantId, ...PLANNABLE },
      data: change,
    });
    return count === 1;
  }

  /**
   * Borra la ruta y deja sus entregas sin ruta (y sin el repartidor que les
   * había dado la ruta). Devuelve false si alguna ya salió.
   */
  remove(tenantId: string, id: string, release: StopChange): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const started = await tx.deliveryNote.count({
        where: { tenantId, routeId: id, status: { not: 'PENDING' } },
      });
      if (started > 0) return false;
      await tx.deliveryNote.updateMany({
        where: { tenantId, routeId: id },
        data: release,
      });
      await tx.deliveryRoute.deleteMany({ where: { id, tenantId } });
      return true;
    });
  }
}
