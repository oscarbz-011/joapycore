import { Injectable } from '@nestjs/common';
import {
  DeliveryAssignmentMode,
  DeliveryNoteStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

const PERSON = { id: true, firstName: true, lastName: true } as const;

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
  sellerRequestedBy: { select: PERSON },
  // La ruta de reparto en la que sale, si ya tiene una.
  route: { select: { id: true, code: true, status: true, routeDate: true } },
  sellerDecidedBy: { select: PERSON },
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

  findBySaleOrder(tenantId: string, saleOrderId: string) {
    return this.prisma.deliveryNote.findFirst({
      where: { tenantId, saleOrderId },
      include,
    });
  }

  // Escribe solo si la nota sigue cumpliendo `whileIs`: quien llama comprueba
  // el conteo para detectar que otro la cambió entre la lectura y la escritura.
  patch(
    tenantId: string,
    id: string,
    whileIs: Pick<
      Prisma.DeliveryNoteWhereInput,
      'status' | 'method' | 'sellerRequestStatus'
    >,
    data: Prisma.DeliveryNoteUncheckedUpdateManyInput,
  ) {
    return this.prisma.deliveryNote.updateMany({
      where: { ...whileIs, id, tenantId },
      data,
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
