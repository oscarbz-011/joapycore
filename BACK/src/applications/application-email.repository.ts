import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ApplicationEmailRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string) {
    return this.prisma.appEmailMessage.findMany({
      where: { tenantId },
      select: {
        id: true,
        recipient: true,
        subject: true,
        bodyText: true,
        status: true,
        sentAt: true,
        createdAt: true,
        sentBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  findById(tenantId: string, id: string) {
    return this.prisma.appEmailMessage.findFirst({
      where: { tenantId, id },
      select: {
        id: true,
        recipient: true,
        subject: true,
        bodyText: true,
        status: true,
        sentAt: true,
        createdAt: true,
        sentBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  createPending(
    tenantId: string,
    sentById: string,
    input: { recipient: string; subject: string; bodyText: string },
  ) {
    return this.prisma.appEmailMessage.create({
      data: { tenantId, sentById, ...input },
    });
  }

  markSent(tenantId: string, id: string) {
    return this.prisma.appEmailMessage.updateMany({
      where: { tenantId, id },
      data: { status: 'SENT', sentAt: new Date(), error: null },
    });
  }

  markFailed(tenantId: string, id: string, error: string) {
    return this.prisma.appEmailMessage.updateMany({
      where: { tenantId, id },
      data: { status: 'FAILED', error },
    });
  }
}
