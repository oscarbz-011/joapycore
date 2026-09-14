import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * Datos de crédito que Ventas lee para evaluar y aprobar ventas a crédito:
 * préstamos y cuotas (Finanzas), configuración y planes de crédito, y el buró.
 * Solo lecturas; agrupadas acá para que los servicios no consulten Prisma
 * directo y el acoplamiento con Finanzas sea visible en un solo lugar.
 */
@Injectable()
export class CreditSourcesRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ── Préstamos del cliente ──────────────────────────────────────────────────

  findLoanHistory(tenantId: string, customerId: string) {
    return this.prisma.loan.findMany({
      where: { tenantId, customerId },
      include: {
        installments: { orderBy: { number: 'asc' } },
        saleOrder: { include: { items: { include: { product: true } } } },
      },
    });
  }

  findActiveLoanTerms(tenantId: string, customerId: string) {
    return this.prisma.loan.findMany({
      where: { tenantId, customerId, status: 'ACTIVE' },
      select: { totalAmount: true, totalInstallments: true },
    });
  }

  findActiveLoanBalances(tenantId: string, customerId: string) {
    return this.prisma.loan.findMany({
      where: { tenantId, customerId, status: 'ACTIVE' },
      select: {
        totalAmount: true,
        installments: { select: { paidAmount: true } },
      },
    });
  }

  async customerHasLoan(tenantId: string, customerId: string) {
    const loan = await this.prisma.loan.findFirst({
      where: { tenantId, customerId },
      select: { id: true },
    });
    return loan !== null;
  }

  countOverdueInstallments(tenantId: string, customerId: string) {
    return this.prisma.installment.count({
      where: { tenantId, status: 'OVERDUE', loan: { customerId } },
    });
  }

  // ── Cliente ────────────────────────────────────────────────────────────────

  findCustomerIncome(tenantId: string, customerId: string) {
    return this.prisma.customer.findFirst({
      where: { id: customerId, tenantId },
      select: { monthlyIncome: true },
    });
  }

  findCustomerCreditLimit(tenantId: string, customerId: string) {
    return this.prisma.customer.findFirst({
      where: { id: customerId, tenantId },
      select: { creditLimit: true },
    });
  }

  // ── Configuración de crédito ───────────────────────────────────────────────

  findMaxIncomePercentage(tenantId: string) {
    return this.prisma.creditConfig.findUnique({
      where: { tenantId },
      select: { maxIncomePercentage: true },
    });
  }

  findActivePlan(tenantId: string, installments: number) {
    return this.prisma.creditPlan.findFirst({
      where: { creditConfig: { tenantId }, installments, isActive: true },
    });
  }

  // ── Buró de crédito ────────────────────────────────────────────────────────

  findBureauConfig(tenantId: string) {
    return this.prisma.creditBureauConfig.findUnique({ where: { tenantId } });
  }

  findLatestBureauCheckForOrder(tenantId: string, saleOrderId: string) {
    return this.prisma.creditBureauCheck.findFirst({
      where: { tenantId, saleOrderId },
      orderBy: { createdAt: 'desc' },
    });
  }

  findLatestBureauCheckForCustomer(tenantId: string, customerId: string) {
    return this.prisma.creditBureauCheck.findFirst({
      where: { tenantId, customerId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
