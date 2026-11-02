import { Injectable } from '@nestjs/common';
import { BillingEventType, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaClientOrTx } from '../../../prisma/types';

const eventSelect = {
  id: true,
  type: true,
  detail: true,
  userId: true,
  createdAt: true,
  creditNoteId: true,
  remissionNoteId: true,
} satisfies Prisma.BillingDocumentEventSelect;

/** Historial fiscal de facturas, notas de crédito y notas de remisión. */
@Injectable()
export class BillingEventsRepository {
  constructor(private readonly prisma: PrismaService) {}

  record(
    data: {
      tenantId: string;
      type: BillingEventType;
      invoiceId?: string | null;
      creditNoteId?: string | null;
      remissionNoteId?: string | null;
      userId?: string | null;
      detail?: Prisma.InputJsonValue;
    },
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.billingDocumentEvent.create({
      data: {
        tenantId: data.tenantId,
        type: data.type,
        invoiceId: data.invoiceId ?? null,
        creditNoteId: data.creditNoteId ?? null,
        remissionNoteId: data.remissionNoteId ?? null,
        userId: data.userId ?? null,
        detail: data.detail,
      },
      select: { id: true },
    });
  }

  findByInvoice(tenantId: string, invoiceId: string) {
    return this.prisma.billingDocumentEvent.findMany({
      where: { tenantId, invoiceId },
      select: eventSelect,
      orderBy: { createdAt: 'asc' },
    });
  }

  findByCreditNote(tenantId: string, creditNoteId: string) {
    return this.prisma.billingDocumentEvent.findMany({
      where: { tenantId, creditNoteId },
      select: eventSelect,
      orderBy: { createdAt: 'asc' },
    });
  }

  findByRemissionNote(tenantId: string, remissionNoteId: string) {
    return this.prisma.billingDocumentEvent.findMany({
      where: { tenantId, remissionNoteId },
      select: eventSelect,
      orderBy: { createdAt: 'asc' },
    });
  }
}
