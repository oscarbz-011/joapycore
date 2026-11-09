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
} satisfies Prisma.BillingDocumentEventSelect;

/** Historial fiscal de facturas y notas de crédito. */
@Injectable()
export class BillingEventsRepository {
  constructor(private readonly prisma: PrismaService) {}

  record(
    data: {
      tenantId: string;
      type: BillingEventType;
      invoiceId?: string | null;
      creditNoteId?: string | null;
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
}
