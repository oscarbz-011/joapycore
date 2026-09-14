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

  deleteDoneBefore(cutoff: Date) {
    return this.prisma.outboxEvent.deleteMany({
      where: { status: 'DONE', processedAt: { lt: cutoff } },
    });
  }
}
