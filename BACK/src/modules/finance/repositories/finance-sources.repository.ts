import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaClientOrTx } from '../../../prisma/types';

/**
 * Datos de otros módulos que Finanzas lee (pedido, factura, sucursal,
 * configuración de crédito) o alimenta (candidatos a Morosos de Cobranzas).
 * Quedan agrupados acá para que servicios y listeners no consulten Prisma
 * directo y el acoplamiento de datos sea visible en un solo lugar.
 */
@Injectable()
export class FinanceSourcesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findSaleOrderWithItems(tenantId: string, saleOrderId: string) {
    return this.prisma.saleOrder.findFirst({
      where: { id: saleOrderId, tenantId },
      include: { items: true },
    });
  }

  findLoanIdByInvoice(tenantId: string, invoiceId: string) {
    return this.prisma.invoice
      .findFirst({
        where: { id: invoiceId, tenantId },
        select: { saleOrder: { select: { loan: { select: { id: true } } } } },
      })
      .then((invoice) => invoice?.saleOrder?.loan?.id ?? null);
  }

  findBranchNumbering(
    tenantId: string,
    branchId: string,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.branch.findFirst({
      where: { id: branchId, tenantId },
      select: { codigoEstablecimiento: true, puntoExpedicion: true },
    });
  }

  // ── Configuración de crédito ───────────────────────────────────────────────

  async findDueDayOfMonth(tenantId: string): Promise<number | null> {
    const config = await this.prisma.creditConfig.findUnique({
      where: { tenantId },
      select: { dueDayOfMonth: true },
    });
    return config?.dueDayOfMonth ?? null;
  }

  findMoraConfigs(tenantIds: string[]) {
    return this.prisma.creditConfig.findMany({
      where: { tenantId: { in: tenantIds } },
      select: {
        tenantId: true,
        moraGraceDays: true,
        interestComponents: { where: { isActive: true } },
      },
    });
  }

  findDelinquencyConfigs() {
    return this.prisma.creditConfig.findMany({
      where: { delinquencyThresholdDays: { not: null } },
      select: {
        tenantId: true,
        moraGraceDays: true,
        delinquencyThresholdDays: true,
      },
    });
  }

  // ── Morosos (Cobranzas) ────────────────────────────────────────────────────

  // Crea el candidato a Moroso si el préstamo todavía no tiene uno; nunca
  // pisa uno existente (ya revisado o en revisión). Devuelve si lo creó.
  async createDelinquencyReportIfMissing(data: {
    tenantId: string;
    customerId: string;
    loanId: string;
    daysOverdue: number;
  }): Promise<boolean> {
    const existing = await this.prisma.delinquencyReport.findUnique({
      where: {
        tenantId_loanId: { tenantId: data.tenantId, loanId: data.loanId },
      },
    });
    if (existing) return false;
    await this.prisma.delinquencyReport.create({ data });
    return true;
  }
}
