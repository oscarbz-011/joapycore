import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Client = PrismaService | Prisma.TransactionClient;

@Injectable()
export class OutboxRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(
    data: {
      tenantId: string;
      eventName: string;
      payload: Prisma.InputJsonValue;
    },
    client: Client = this.prisma,
  ) {
    return client.outboxEvent.create({ data, select: { id: true } });
  }

  /**
   * Toma el evento para procesarlo si está pendiente (o falló y ya toca
   * reintentar). La guarda de estado evita que dos procesos lo despachen a
   * la vez: solo uno obtiene count = 1.
   */
  async claim(id: string, now: Date): Promise<boolean> {
    const result = await this.prisma.outboxEvent.updateMany({
      where: {
        id,
        status: { in: ['PENDING', 'FAILED'] },
        nextAttemptAt: { lte: now },
      },
      // nextAttemptAt = momento en que se tomó: findDue lo usa para detectar
      // procesamientos interrumpidos.
      data: {
        status: 'PROCESSING',
        attempts: { increment: 1 },
        nextAttemptAt: now,
      },
    });
    return result.count === 1;
  }

  findById(id: string) {
    return this.prisma.outboxEvent.findUnique({ where: { id } });
  }

  markDone(id: string) {
    return this.prisma.outboxEvent.update({
      where: { id },
      data: { status: 'DONE', processedAt: new Date(), lastError: null },
    });
  }

  markFailed(id: string, error: string, nextAttemptAt: Date) {
    return this.prisma.outboxEvent.update({
      where: { id },
      data: {
        status: 'FAILED',
        lastError: error.slice(0, 2000),
        nextAttemptAt,
      },
    });
  }

  /** Eventos listos para (re)intentar y procesos que quedaron colgados. */
  async findDue(
    now: Date,
    maxAttempts: number,
    stuckBefore: Date,
    limit = 100,
  ) {
    await this.prisma.outboxEvent.updateMany({
      where: { status: 'PROCESSING', nextAttemptAt: { lt: stuckBefore } },
      data: { status: 'FAILED', lastError: 'Procesamiento interrumpido' },
    });
    const rows = await this.prisma.outboxEvent.findMany({
      where: {
        status: { in: ['PENDING', 'FAILED'] },
        nextAttemptAt: { lte: now },
        attempts: { lt: maxAttempts },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  // Un evento con un consumidor que falló sin reintento se conserva hasta que
  // alguien lo reintente: si no, el aviso desaparecería a los 7 días.
  deleteDoneBefore(cutoff: Date) {
    return this.prisma.outboxEvent.deleteMany({
      where: {
        status: 'DONE',
        processedAt: { lt: cutoff },
        deliveries: { none: { lastError: { not: null } } },
      },
    });
  }

  /**
   * Lo que necesita que alguien actúe: eventos que agotaron los reintentos y
   * consumidores que fallaron sin reintento (quedan DONE con el error).
   */
  findFailed(tenantId: string, maxAttempts: number) {
    return this.prisma.outboxEvent.findMany({
      where: failedWhere(tenantId, maxAttempts),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        eventName: true,
        payload: true,
        status: true,
        attempts: true,
        lastError: true,
        createdAt: true,
        nextAttemptAt: true,
        deliveries: {
          where: deliveryFailedWhere(maxAttempts),
          orderBy: { consumer: 'asc' },
          select: {
            consumer: true,
            status: true,
            lastError: true,
            updatedAt: true,
          },
        },
      },
    });
  }

  countFailed(tenantId: string, maxAttempts: number) {
    return this.prisma.outboxEvent.count({
      where: failedWhere(tenantId, maxAttempts),
    });
  }

  findForRetry(tenantId: string, id: string) {
    return this.prisma.outboxEvent.findFirst({
      where: { tenantId, id },
      select: {
        id: true,
        tenantId: true,
        eventName: true,
        payload: true,
        status: true,
        attempts: true,
      },
    });
  }

  /** Un intento más, ya: si vuelve a fallar queda trabado otra vez. */
  async reopenStuck(tenantId: string, id: string, maxAttempts: number) {
    const result = await this.prisma.outboxEvent.updateMany({
      where: { tenantId, id, status: 'FAILED', attempts: { gte: maxAttempts } },
      data: { attempts: maxAttempts - 1, nextAttemptAt: new Date() },
    });
    return result.count === 1;
  }

  findDelivery(tenantId: string, eventId: string, consumer: string) {
    return this.prisma.outboxDelivery.findFirst({
      where: { tenantId, eventId, consumer },
      select: { status: true, lastError: true },
    });
  }

  async findDeliveredConsumers(eventId: string): Promise<string[]> {
    const rows = await this.prisma.outboxDelivery.findMany({
      where: { eventId, status: 'DONE' },
      select: { consumer: true },
    });
    return rows.map((r) => r.consumer);
  }

  /** `error` sin `failed`: falló pero no se reintenta, queda anotado. */
  recordDelivery(
    tenantId: string,
    eventId: string,
    consumer: string,
    result: { failed: boolean; error?: string },
  ) {
    const status = result.failed ? 'FAILED' : 'DONE';
    const lastError = result.error?.slice(0, 2000) ?? null;
    const processedAt = result.failed ? null : new Date();
    return this.prisma.outboxDelivery.upsert({
      where: { eventId_consumer: { eventId, consumer } },
      create: { tenantId, eventId, consumer, status, lastError, processedAt },
      update: { status, lastError, processedAt, attempts: { increment: 1 } },
    });
  }
}

const STUCK = (maxAttempts: number) =>
  ({
    status: 'FAILED',
    attempts: { gte: maxAttempts },
  }) satisfies Prisma.OutboxEventWhereInput;

function deliveryFailedWhere(
  maxAttempts: number,
): Prisma.OutboxDeliveryWhereInput {
  return {
    OR: [
      { status: 'DONE', lastError: { not: null } },
      { status: 'FAILED', event: STUCK(maxAttempts) },
    ],
  };
}

function failedWhere(
  tenantId: string,
  maxAttempts: number,
): Prisma.OutboxEventWhereInput {
  return {
    tenantId,
    OR: [
      STUCK(maxAttempts),
      { deliveries: { some: { status: 'DONE', lastError: { not: null } } } },
    ],
  };
}
