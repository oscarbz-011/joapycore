import { Injectable } from '@nestjs/common';
import { BillingDocumentType, BillingModality, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaClientOrTx } from '../../../prisma/types';

const seriesInclude = {
  branch: { select: { id: true, name: true } },
  _count: { select: { invoices: true } },
} satisfies Prisma.BillingSeriesInclude;

@Injectable()
export class BillingSeriesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(tenantId: string) {
    return this.prisma.billingSeries.findMany({
      where: { tenantId },
      include: seriesInclude,
      orderBy: [{ establecimiento: 'asc' }, { puntoExpedicion: 'asc' }],
    });
  }

  findById(
    tenantId: string,
    id: string,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.billingSeries.findFirst({
      where: { id, tenantId },
      include: seriesInclude,
    });
  }

  // Series activas que pueden numerar un documento de la sucursal (o de
  // cualquier sucursal si el documento no tiene una).
  findActiveForBranch(
    tenantId: string,
    branchId: string | null,
    documentType: BillingDocumentType,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.billingSeries.findMany({
      where: {
        tenantId,
        documentType,
        isActive: true,
        ...(branchId ? { branchId } : {}),
      },
      include: seriesInclude,
      orderBy: { createdAt: 'asc' },
    });
  }

  create(data: Prisma.BillingSeriesUncheckedCreateInput) {
    return this.prisma.billingSeries.create({ data, include: seriesInclude });
  }

  update(
    tenantId: string,
    id: string,
    data: Prisma.BillingSeriesUncheckedUpdateInput,
  ) {
    return this.prisma.billingSeries.update({
      where: { id, tenantId },
      data,
      include: seriesInclude,
    });
  }

  /**
   * Reserva el próximo número de una serie de impresión propia. El UPDATE
   * toma el lock de la fila, así que dos emisiones simultáneas reciben
   * números distintos. Devuelve null si el rango está agotado; la
   * transacción que llama debe abortar en ese caso.
   */
  async claimNextNumber(
    tenantId: string,
    id: string,
    client: PrismaClientOrTx,
  ): Promise<number | null> {
    // La condición del rango va en el mismo UPDATE: con el rango agotado no
    // se incrementa, y quien llama puede seguir sin número.
    try {
      const updated = await client.billingSeries.update({
        where: {
          id,
          tenantId,
          modality: BillingModality.SELF_PRINTED,
          nextNumber: { lte: client.billingSeries.fields.rangeTo },
        },
        data: { nextNumber: { increment: 1 } },
        select: { nextNumber: true },
      });
      return updated.nextNumber - 1;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        return null;
      }
      throw error;
    }
  }

  // Tras usar un número del talonario, el siguiente sugerido avanza (nunca
  // retrocede, aunque se carguen números salteados).
  advanceSuggestedNumber(
    tenantId: string,
    id: string,
    used: number,
    client: PrismaClientOrTx,
  ) {
    return client.billingSeries.updateMany({
      where: { id, tenantId, nextNumber: { lte: used } },
      data: { nextNumber: used + 1 },
    });
  }

  // Usado por una factura o inutilizado: en ambos casos la hoja ya no sirve.
  async isNumberUsed(
    seriesId: string,
    serieCode: string,
    sequential: number,
    client: PrismaClientOrTx = this.prisma,
  ) {
    const where = { seriesId, serieCode, sequential };
    const [invoice, voided] = await Promise.all([
      client.invoice.findFirst({ where, select: { id: true } }),
      client.billingVoidedNumber.findFirst({ where, select: { id: true } }),
    ]);
    return Boolean(invoice || voided);
  }

  createVoided(
    data: Prisma.BillingVoidedNumberUncheckedCreateInput,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.billingVoidedNumber.create({ data, select: { id: true } });
  }

  findVoided(tenantId: string, seriesId: string) {
    return this.prisma.billingVoidedNumber.findMany({
      where: { tenantId, seriesId },
      select: {
        id: true,
        sequential: true,
        reason: true,
        createdAt: true,
        voidedById: true,
        invoice: {
          select: { id: true, invoicePrefix: true, invoiceNumber: true },
        },
        scanFile: { select: { id: true, originalName: true, mimeType: true } },
      },
      orderBy: { sequential: 'desc' },
    });
  }
}
