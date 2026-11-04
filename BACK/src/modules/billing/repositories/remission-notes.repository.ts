import { Injectable } from '@nestjs/common';
import {
  Prisma,
  RemissionNoteStatus,
  RemissionTransitStatus,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaClientOrTx } from '../../../prisma/types';

const warehouseRef = {
  id: true,
  name: true,
  branch: { select: { id: true, name: true } },
} satisfies Prisma.WarehouseSelect;

const listSelect = {
  id: true,
  number: true,
  numberPrefix: true,
  motive: true,
  status: true,
  transitStatus: true,
  receivedAt: true,
  modality: true,
  issuedAt: true,
  recipientName: true,
  transportStartDate: true,
  transportEndDate: true,
  createdAt: true,
  branch: { select: { id: true, name: true } },
  invoice: { select: { id: true, invoicePrefix: true, invoiceNumber: true } },
  fromWarehouse: { select: warehouseRef },
  toWarehouse: { select: warehouseRef },
  _count: { select: { items: true } },
} satisfies Prisma.RemissionNoteSelect;

const fileSelect = { id: true, originalName: true, mimeType: true };

const detailSelect = {
  ...listSelect,
  motiveDetail: true,
  customerId: true,
  recipientDocument: true,
  originAddress: true,
  originCity: true,
  originDepartment: true,
  destinationAddress: true,
  destinationCity: true,
  destinationDepartment: true,
  transportType: true,
  vehicleBrand: true,
  vehiclePlate: true,
  trailerPlate: true,
  carrierName: true,
  carrierRuc: true,
  carrierAddress: true,
  driverName: true,
  driverDocument: true,
  driverAddress: true,
  notes: true,
  seriesId: true,
  timbrado: true,
  timbradoValidFrom: true,
  timbradoValidUntil: true,
  establecimiento: true,
  puntoExpedicion: true,
  serieCode: true,
  sequential: true,
  issuedById: true,
  voidedAt: true,
  voidReason: true,
  voidedById: true,
  receivedById: true,
  receptionNotes: true,
  pdfFileId: true,
  physicalScan: { select: fileSelect },
  items: {
    select: {
      id: true,
      productId: true,
      invoiceItemId: true,
      description: true,
      unit: true,
      quantity: true,
      serialNumbers: true,
      receivedQuantity: true,
      receivedSerials: true,
    },
    orderBy: { description: 'asc' },
  },
} satisfies Prisma.RemissionNoteSelect;

// Lo que se imprime: la nota y los datos del emisor.
const printSource = {
  ...detailSelect,
  invoice: {
    select: {
      id: true,
      invoicePrefix: true,
      invoiceNumber: true,
      timbrado: true,
      issuedAt: true,
    },
  },
  tenant: {
    select: {
      name: true,
      razonSocial: true,
      nombreFantasia: true,
      ruc: true,
      address: true,
      numeroCasa: true,
      city: true,
      phone: true,
      actividadesEconomicas: true,
      logoFileId: true,
    },
  },
  branch: {
    select: {
      id: true,
      name: true,
      address: true,
      numeroCasa: true,
      city: true,
    },
  },
} satisfies Prisma.RemissionNoteSelect;

export type RemissionNotePrintSource = Prisma.RemissionNoteGetPayload<{
  select: typeof printSource;
}>;

@Injectable()
export class RemissionNotesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(tenantId: string) {
    return this.prisma.remissionNote.findMany({
      where: { tenantId },
      select: listSelect,
      orderBy: { issuedAt: 'desc' },
    });
  }

  findByInvoice(tenantId: string, invoiceId: string) {
    return this.prisma.remissionNote.findMany({
      where: { tenantId, invoiceId },
      select: listSelect,
      orderBy: { issuedAt: 'desc' },
    });
  }

  findById(
    tenantId: string,
    id: string,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.remissionNote.findFirst({
      where: { id, tenantId },
      select: detailSelect,
    });
  }

  findForPrint(
    tenantId: string,
    id: string,
  ): Promise<RemissionNotePrintSource | null> {
    return this.prisma.remissionNote.findFirst({
      where: { id, tenantId },
      select: printSource,
    });
  }

  /** Unidades de cada ítem de la factura que ya salieron en una nota vigente. */
  async remittedQuantities(
    tenantId: string,
    invoiceId: string,
    client: PrismaClientOrTx = this.prisma,
  ): Promise<Map<string, number>> {
    const rows = await client.remissionNoteItem.groupBy({
      by: ['invoiceItemId'],
      where: {
        remissionNote: {
          tenantId,
          invoiceId,
          status: RemissionNoteStatus.ISSUED,
        },
        invoiceItemId: { not: null },
      },
      _sum: { quantity: true },
    });
    return new Map(
      rows
        .filter((r) => r.invoiceItemId)
        .map((r) => [r.invoiceItemId as string, r._sum.quantity ?? 0]),
    );
  }

  /** N/S de cada ítem de la factura que ya salieron en una nota vigente. */
  async remittedSerials(
    tenantId: string,
    invoiceId: string,
    client: PrismaClientOrTx = this.prisma,
  ): Promise<Map<string, string[]>> {
    const rows = await client.remissionNoteItem.findMany({
      where: {
        remissionNote: {
          tenantId,
          invoiceId,
          status: RemissionNoteStatus.ISSUED,
        },
        invoiceItemId: { not: null },
      },
      select: { invoiceItemId: true, serialNumbers: true },
    });
    const result = new Map<string, string[]>();
    for (const row of rows) {
      if (!row.invoiceItemId) continue;
      result.set(row.invoiceItemId, [
        ...(result.get(row.invoiceItemId) ?? []),
        ...row.serialNumbers,
      ]);
    }
    return result;
  }

  createWithItems(
    data: Omit<Prisma.RemissionNoteUncheckedCreateInput, 'items'>,
    items: Omit<
      Prisma.RemissionNoteItemUncheckedCreateWithoutRemissionNoteInput,
      'id'
    >[],
    client: PrismaClientOrTx,
  ) {
    return client.remissionNote.create({
      data: { ...data, items: { create: items } },
      select: { id: true },
    });
  }

  // Solo una nota vigente se anula (un traslado, mientras está en tránsito);
  // el count dice si otra anulación o la recepción ganó.
  voidIfIssued(
    tenantId: string,
    id: string,
    data: { reason: string; at: Date; userId: string | null },
    onlyInTransit: boolean,
    client: PrismaClientOrTx,
  ) {
    return client.remissionNote.updateMany({
      where: {
        id,
        tenantId,
        status: RemissionNoteStatus.ISSUED,
        ...(onlyInTransit
          ? { transitStatus: RemissionTransitStatus.IN_TRANSIT }
          : {}),
      },
      data: {
        status: RemissionNoteStatus.VOIDED,
        voidReason: data.reason,
        voidedAt: data.at,
        voidedById: data.userId,
      },
    });
  }

  markReceived(
    tenantId: string,
    id: string,
    data: {
      transitStatus: RemissionTransitStatus;
      at: Date;
      userId: string | null;
      notes: string | null;
    },
    client: PrismaClientOrTx,
  ) {
    return client.remissionNote.updateMany({
      where: {
        id,
        tenantId,
        status: RemissionNoteStatus.ISSUED,
        transitStatus: RemissionTransitStatus.IN_TRANSIT,
      },
      data: {
        transitStatus: data.transitStatus,
        receivedAt: data.at,
        receivedById: data.userId,
        receptionNotes: data.notes,
      },
    });
  }

  setItemReceived(
    tenantId: string,
    itemId: string,
    received: { quantity: number; serialNumbers: string[] },
    client: PrismaClientOrTx,
  ) {
    return client.remissionNoteItem.updateMany({
      where: { id: itemId, remissionNote: { tenantId } },
      data: {
        receivedQuantity: received.quantity,
        receivedSerials: received.serialNumbers,
      },
    });
  }

  setPhysicalScan(
    tenantId: string,
    id: string,
    fileId: string | null,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.remissionNote.updateMany({
      where: { id, tenantId },
      data: { physicalScanFileId: fileId },
    });
  }

  // Solo la primera vez: un reintento del outbox no reemplaza un PDF ya guardado.
  setPdf(tenantId: string, id: string, fileId: string) {
    return this.prisma.remissionNote.updateMany({
      where: { id, tenantId, pdfFileId: null },
      data: { pdfFileId: fileId },
    });
  }
}
