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
    const updated = await client.billingSeries.update({
      where: { id, tenantId, modality: BillingModality.SELF_PRINTED },
      data: { nextNumber: { increment: 1 } },
      select: { nextNumber: true, rangeTo: true },
    });
    const claimed = updated.nextNumber - 1;
    return claimed <= updated.rangeTo ? claimed : null;
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

  isNumberUsed(
    seriesId: string,
    serieCode: string,
    sequential: number,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.invoice
      .findFirst({
        where: { seriesId, serieCode, sequential },
        select: { id: true },
      })
      .then(Boolean);
  }
}
