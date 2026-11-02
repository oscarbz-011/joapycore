import { Injectable } from '@nestjs/common';
import { Prisma, RemissionNoteStatus } from '@prisma/client';
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

  // Solo una nota vigente se anula; el count dice si otra anulación ganó.
  voidIfIssued(
    tenantId: string,
    id: string,
    data: { reason: string; at: Date; userId: string | null },
    client: PrismaClientOrTx,
  ) {
    return client.remissionNote.updateMany({
      where: { id, tenantId, status: RemissionNoteStatus.ISSUED },
      data: {
        status: RemissionNoteStatus.VOIDED,
        voidReason: data.reason,
        voidedAt: data.at,
        voidedById: data.userId,
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
