import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type PlatformEmailStatus = 'SENT' | 'FAILED' | 'UNKNOWN';

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class PlatformEmailRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Con qué nombre sale la empresa y a dónde vuelven las respuestas. */
  findTenant(tenantId: string) {
    return this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, nombreFantasia: true, email: true },
    });
  }

  /**
   * Correos de la empresa por este remitente en las últimas 24 horas. Cuenta
   * también los de resultado incierto: pudieron haber salido.
   */
  countRecent(tenantId: string, now: Date = new Date()) {
    return this.prisma.platformEmailMessage.count({
      where: {
        tenantId,
        status: { in: ['SENT', 'UNKNOWN'] },
        createdAt: { gte: new Date(now.getTime() - DAY_MS) },
      },
    });
  }

  /** Deja constancia del envío. No guarda el cuerpo ni los adjuntos. */
  record(data: {
    tenantId: string | null;
    purpose: string;
    recipient: string;
    subject: string;
    fromAddress: string;
    replyTo: string | null;
    status: PlatformEmailStatus;
    providerMessageId?: string;
    errorCode?: string;
  }) {
    return this.prisma.platformEmailMessage.create({
      data,
      select: { id: true },
    });
  }
}
