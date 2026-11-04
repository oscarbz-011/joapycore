import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaClientOrTx } from '../../../prisma/types';
import { receiptSelect } from './invoices.repository';

const customerSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  taxpayerType: true,
} satisfies Prisma.CustomerSelect;

const invoiceRef = {
  id: true,
  invoicePrefix: true,
  invoiceNumber: true,
  total: true,
  issuedAt: true,
  status: true,
} satisfies Prisma.InvoiceSelect;

const listSelect = {
  id: true,
  number: true,
  numberPrefix: true,
  kind: true,
  reason: true,
  total: true,
  status: true,
  modality: true,
  issuedAt: true,
  appliedToBalance: true,
  createdAt: true,
  customer: { select: customerSelect },
  invoice: {
    select: {
      ...invoiceRef,
      saleOrder: { select: { customer: { select: customerSelect } } },
    },
  },
} satisfies Prisma.CreditNoteSelect;

const fileSelect = { id: true, originalName: true, mimeType: true };

// Lo que hace falta para imprimir una nota de crédito: los datos de la
// factura que modifica (emisor, comprador) y los de la nota.
const receiptSource = {
  id: true,
  modality: true,
  numberPrefix: true,
  number: true,
  timbrado: true,
  timbradoValidFrom: true,
  timbradoValidUntil: true,
  issuedAt: true,
  total: true,
  reason: true,
  issuedById: true,
  pdfFileId: true,
  series: { select: { printLayout: true } },
  items: {
    select: {
      description: true,
      quantity: true,
      unitPrice: true,
      total: true,
      ivaRate: true,
      ivaAmount: true,
    },
  },
  invoice: {
    select: {
      ...receiptSelect,
      tenant: { select: { ...receiptSelect.tenant.select, logoFileId: true } },
    },
  },
} satisfies Prisma.CreditNoteSelect;

export type CreditNoteReceiptSource = Prisma.CreditNoteGetPayload<{
  select: typeof receiptSource;
}>;

@Injectable()
export class CreditNotesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(tenantId: string) {
    return this.prisma.creditNote.findMany({
      where: { tenantId },
      select: listSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  findByInvoice(tenantId: string, invoiceId: string) {
    return this.prisma.creditNote.findMany({
      where: { tenantId, invoiceId },
      select: listSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  findById(tenantId: string, id: string) {
    return this.prisma.creditNote.findFirst({
      where: { id, tenantId },
      select: {
        ...listSelect,
        serieCode: true,
        sequential: true,
        timbrado: true,
        timbradoValidFrom: true,
        timbradoValidUntil: true,
        establecimiento: true,
        puntoExpedicion: true,
        seriesId: true,
        issuedById: true,
        pdfFileId: true,
        formPrintCount: true,
        formPrintedAt: true,
        physicalScan: { select: fileSelect },
        items: {
          select: {
            id: true,
            invoiceItemId: true,
            description: true,
            quantity: true,
            unitPrice: true,
            total: true,
            ivaRate: true,
            ivaAmount: true,
            restockQuantity: true,
            serialNumbers: true,
          },
          orderBy: { description: 'asc' },
        },
        refunds: {
          select: {
            id: true,
            amount: true,
            method: true,
            reference: true,
            createdAt: true,
          },
        },
        customerCredits: {
          select: { id: true, amount: true, createdAt: true },
        },
      },
    });
  }

  /** Unidades ya acreditadas de cada ítem de la factura. */
  async creditedQuantities(
    tenantId: string,
    invoiceId: string,
    client: PrismaClientOrTx = this.prisma,
  ): Promise<Map<string, number>> {
    const rows = await client.creditNoteItem.groupBy({
      by: ['invoiceItemId'],
      where: {
        creditNote: { tenantId, invoiceId },
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
    data: Omit<Prisma.CreditNoteUncheckedCreateInput, 'items'>,
    items: Omit<
      Prisma.CreditNoteItemUncheckedCreateWithoutCreditNoteInput,
      'id'
    >[],
    client: PrismaClientOrTx,
  ) {
    return client.creditNote.create({
      data: { ...data, items: { create: items } },
      select: { id: true },
    });
  }

  findForReceipt(
    tenantId: string,
    id: string,
    client: PrismaClientOrTx = this.prisma,
  ): Promise<CreditNoteReceiptSource | null> {
    return client.creditNote.findFirst({
      where: { id, tenantId },
      select: receiptSource,
    });
  }

  recordFormPrint(
    tenantId: string,
    id: string,
    at: Date,
    client: PrismaClientOrTx,
  ) {
    return client.creditNote.updateMany({
      where: { id, tenantId },
      data: { formPrintCount: { increment: 1 }, formPrintedAt: at },
    });
  }

  setPhysicalScan(
    tenantId: string,
    id: string,
    fileId: string | null,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.creditNote.updateMany({
      where: { id, tenantId },
      data: { physicalScanFileId: fileId },
    });
  }

  // Solo la primera vez: un reintento del outbox no reemplaza un PDF ya guardado.
  setPdf(tenantId: string, id: string, fileId: string) {
    return this.prisma.creditNote.updateMany({
      where: { id, tenantId, pdfFileId: null },
      data: { pdfFileId: fileId },
    });
  }
}
