import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const EVENT = {
  id: true,
  createdBy: true,
  title: true,
  description: true,
  location: true,
  allDay: true,
  startsAt: true,
  endsAt: true,
  companyWide: true,
  updatedAt: true,
} satisfies Prisma.CalendarEventSelect;

export type EventData = {
  title: string;
  description: string | null;
  location: string | null;
  allDay: boolean;
  startsAt: Date;
  endsAt: Date;
  companyWide: boolean;
};

// Lo que un usuario ve: sus eventos y los de toda la empresa.
const visibleTo = (tenantId: string, userId: string) =>
  ({
    tenantId,
    OR: [{ createdBy: userId }, { companyWide: true }],
  }) satisfies Prisma.CalendarEventWhereInput;

@Injectable()
export class CalendarRepository {
  constructor(private readonly prisma: PrismaService) {}

  between(tenantId: string, userId: string, from: Date, to: Date) {
    return this.prisma.calendarEvent.findMany({
      where: {
        ...visibleTo(tenantId, userId),
        startsAt: { lte: to },
        endsAt: { gte: from },
      },
      select: EVENT,
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      take: 2000,
    });
  }

  visible(tenantId: string, userId: string, id: string) {
    return this.prisma.calendarEvent.findFirst({
      where: { ...visibleTo(tenantId, userId), id },
      select: EVENT,
    });
  }

  create(tenantId: string, userId: string, data: EventData) {
    return this.prisma.calendarEvent.create({
      data: { tenantId, createdBy: userId, ...data },
      select: EVENT,
    });
  }

  // Solo quien lo creó lo modifica o lo borra.
  update(
    tenantId: string,
    userId: string,
    id: string,
    data: Partial<EventData>,
  ) {
    return this.prisma.calendarEvent.updateMany({
      where: { tenantId, createdBy: userId, id },
      data,
    });
  }

  remove(tenantId: string, userId: string, id: string) {
    return this.prisma.calendarEvent.deleteMany({
      where: { tenantId, createdBy: userId, id },
    });
  }

  feedOf(tenantId: string, userId: string) {
    return this.prisma.calendarFeed.findFirst({
      where: { tenantId, userId },
      select: { token: true },
    });
  }

  saveFeed(tenantId: string, userId: string, token: string) {
    return this.prisma.calendarFeed.upsert({
      where: { userId },
      create: { tenantId, userId, token },
      update: { token },
      select: { token: true },
    });
  }

  feedByToken(token: string) {
    return this.prisma.calendarFeed.findUnique({
      where: { token },
      select: { tenantId: true, userId: true },
    });
  }

  activeUser(tenantId: string, userId: string) {
    return this.prisma.user.findFirst({
      where: {
        tenantId,
        id: userId,
        status: 'ACTIVE',
        deletedAt: null,
        tenant: { status: 'ACTIVE' },
      },
      select: { id: true, tenant: { select: { name: true } } },
    });
  }
}
