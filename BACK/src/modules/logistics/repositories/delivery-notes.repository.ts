import { Injectable } from '@nestjs/common';
import { DeliveryAssignmentMode, DeliveryNoteStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

const include = {
  saleOrder: {
    include: {
      customer: true,
      seller: { select: { id: true, firstName: true, lastName: true } },
      items: {
        include: {
          product: { select: { id: true, name: true, isSerialized: true } },
        },
      },
    },
  },
  assignedEmployee: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      mobilePhone: true,
      contractType: true,
    },
  },
  trackingEvents: {
    orderBy: { recordedAt: 'asc' as const },
    include: {
      recordedBy: { select: { id: true, firstName: true, lastName: true } },
    },
  },
} as const;

@Injectable()
export class DeliveryNotesRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Crea la nota PENDING del pedido si todavía no tiene una. */
  async ensurePendingForOrder(
    tenantId: string,
    saleOrderId: string,
  ): Promise<{ id: string; created: boolean }> {
    const existing = await this.prisma.deliveryNote.findFirst({
      where: { tenantId, saleOrderId },
      select: { id: true },
    });
    if (existing) return { id: existing.id, created: false };
    const note = await this.prisma.deliveryNote.upsert({
      where: { saleOrderId },
      create: {
        tenantId,
        saleOrderId,
        status: 'PENDING',
        issuedAt: new Date(),
      },
      update: {},
      select: { id: true },
    });
    return { id: note.id, created: true };
  }

  findAll(tenantId: string, status?: DeliveryNoteStatus) {
    return this.prisma.deliveryNote.findMany({
      where: { tenantId, ...(status ? { status } : {}) },
      include,
      orderBy: { createdAt: 'desc' },
    });
  }

  findById(tenantId: string, id: string) {
    return this.prisma.deliveryNote.findFirst({
      where: { id, tenantId },
      include,
    });
  }

  findMine(tenantId: string, employeeId: string, status?: DeliveryNoteStatus) {
    return this.prisma.deliveryNote.findMany({
      where: {
        tenantId,
        assignedEmployeeId: employeeId,
        ...(status ? { status } : {}),
      },
      include,
      orderBy: { createdAt: 'desc' },
    });
  }

  assign(
    tenantId: string,
    id: string,
    data: {
      assignmentMode: DeliveryAssignmentMode;
      assignedEmployeeId?: string | null;
      carrier?: string;
      externalTrackingRef?: string | null;
    },
  ) {
    return this.prisma.deliveryNote.updateMany({
      where: { id, tenantId },
      data,
    });
  }

  update(
    tenantId: string,
    id: string,
    data: {
      status: DeliveryNoteStatus;
      carrier?: string;
      vehicle?: string;
      notes?: string;
      deliveredAt?: Date;
    },
  ) {
    return this.prisma.deliveryNote.updateMany({
      where: { id, tenantId },
      data,
    });
  }
}
