import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

function toNum(value: unknown): number {
  if (typeof value === 'object' && value !== null && 'toNumber' in value) {
    return (value as { toNumber(): number }).toNumber();
  }
  return Number(value);
}

export type CreditRating = 'SIN_HISTORIAL' | 'BUENO' | 'REGULAR' | 'RIESGO';

export interface ActiveLoanSummary {
  loanId: string;
  productNames: string[];
  totalAmount: number;
  outstandingBalance: number;
  monthlyInstallment: number;
  installmentsPaid: number;
  totalInstallments: number;
  startDate: Date;
  firstDueDate: Date | null;
  finalDueDate: Date | null;
  nextDueDate: Date | null;
}

export interface CreditHistory {
  rating: CreditRating;
  activeLoans: ActiveLoanSummary[];
  overdueCount: number;
  overdueAmount: number;
}

export interface IncomeCapacity {
  applicable: boolean;
  // Ingreso del cliente solo, sin sumar garantes — se mantiene por
  // separado para poder mostrar el desglose en el panel del analista.
  customerIncome: number | null;
  // Suma de los ingresos declarados de los garantes del pedido (0 si no
  // tiene garantes o ninguno declaró ingreso).
  guarantorIncome: number;
  // Ingreso combinado (customerIncome + guarantorIncome) — es el que se
  // usa para calcular maxAllowed. Un garante amplía la línea de crédito
  // disponible porque respalda la deuda con su propio sueldo.
  monthlyIncome: number | null;
  maxIncomePercentage: number | null;
  maxAllowed: number | null;
  currentCommitment: number;
  proposedMonthlyPayment: number;
  available: number | null;
  exceeds: boolean;
}

export interface BureauCheckStatus {
  required: boolean;
  latestResult: 'CLEAN' | 'FLAGGED' | null;
}

// Servicio de solo-lectura: agrega el historial crediticio de un cliente
// (otros préstamos activos, morosidad, calificación interna) y la capacidad
// de pago por sueldo, para que el analista los vea antes de aprobar un
// crédito. Separado de SaleOrdersService para no seguir infl ándolo — este
// no muta nada, solo lee y calcula.
@Injectable()
export class CreditEvaluationService {
  constructor(private readonly prisma: PrismaService) {}

  async getCustomerCreditHistory(
    tenantId: string,
    customerId: string,
  ): Promise<CreditHistory> {
    const loans = await this.prisma.loan.findMany({
      where: { tenantId, customerId },
      include: {
        installments: { orderBy: { number: 'asc' } },
        saleOrder: { include: { items: { include: { product: true } } } },
      },
    });

    if (loans.length === 0) {
      return {
        rating: 'SIN_HISTORIAL',
        activeLoans: [],
        overdueCount: 0,
        overdueAmount: 0,
      };
    }

    const activeLoans: ActiveLoanSummary[] = loans
      .filter((loan) => loan.status === 'ACTIVE')
      .map((loan) => {
        const paid = loan.installments.reduce(
          (sum, i) => sum + toNum(i.paidAmount),
          0,
        );
        const outstandingBalance = Math.max(toNum(loan.totalAmount) - paid, 0);
        const monthlyInstallment = loan.installments[0]
          ? toNum(loan.installments[0].amount)
          : toNum(loan.totalAmount) / loan.totalInstallments;
        const nextUnpaid = loan.installments.find((i) => i.status !== 'PAID');
        const installmentsPaid = loan.installments.filter(
          (i) => i.status === 'PAID',
        ).length;
        // installments viene ordenado por number asc — la primera y la última
        // marcan el rango real de vencimientos, distinto de la fecha de compra
        // (startDate) y del próximo vencimiento pendiente (nextDueDate).
        const firstInstallment = loan.installments[0];
        const lastInstallment = loan.installments[loan.installments.length - 1];
        const productNames = loan.saleOrder.items.map(
          (i) => i.product?.name ?? i.description ?? '—',
        );
        return {
          loanId: loan.id,
          productNames,
          totalAmount: toNum(loan.totalAmount),
          outstandingBalance,
          monthlyInstallment,
          installmentsPaid,
          totalInstallments: loan.totalInstallments,
          startDate: loan.createdAt,
          firstDueDate: firstInstallment?.dueDate ?? null,
          finalDueDate: lastInstallment?.dueDate ?? null,
          nextDueDate: nextUnpaid?.dueDate ?? null,
        };
      });

    let overdueCount = 0;
    let overdueAmount = 0;
    // Comparar paidAt contra dueDate en vez de depender de un cargo de mora
    // acumulado: es una señal que existe siempre (independiente de si el
    // tenant configuró algún InterestComponent) y no se resetea al cobrar
    // el recargo, a diferencia de InstallmentInterestCharge.amount que sí
    // vuelve a 0 una vez saldado.
    let everLate = false;
    for (const loan of loans) {
      for (const inst of loan.installments) {
        if (inst.status === 'OVERDUE') {
          overdueCount += 1;
          overdueAmount += toNum(inst.amount) - toNum(inst.paidAmount);
        }
        if (inst.paidAt && inst.paidAt > inst.dueDate) everLate = true;
      }
    }

    let rating: CreditRating;
    if (overdueCount > 0) rating = 'RIESGO';
    else if (everLate) rating = 'REGULAR';
    else rating = 'BUENO';

    return { rating, activeLoans, overdueCount, overdueAmount };
  }

  // guarantorIncomes: ingresos mensuales declarados de los garantes del
  // pedido (el caller ya tiene el pedido con sus garantes cargados, así que
  // los resuelve y los pasa — este servicio no conoce SaleOrder). Un
  // garante amplía la línea de crédito disponible: la capacidad de pago se
  // evalúa sobre la suma del ingreso del cliente más el de sus garantes,
  // no solo el del cliente.
  async evaluateIncomeCapacity(
    tenantId: string,
    customerId: string,
    proposedMonthlyPayment: number,
    guarantorIncomes: number[] = [],
  ): Promise<IncomeCapacity> {
    const [customer, creditConfig] = await Promise.all([
      this.prisma.customer.findFirst({
        where: { id: customerId, tenantId },
        select: { monthlyIncome: true },
      }),
      this.prisma.creditConfig.findUnique({
        where: { tenantId },
        select: { maxIncomePercentage: true },
      }),
    ]);

    const customerIncome =
      customer?.monthlyIncome != null ? toNum(customer.monthlyIncome) : null;
    const guarantorIncome = guarantorIncomes.reduce((sum, i) => sum + i, 0);
    const maxIncomePercentage =
      creditConfig?.maxIncomePercentage != null
        ? toNum(creditConfig.maxIncomePercentage)
        : null;

    // Sin ningún sueldo declarado (ni cliente ni garantes) o sin % configurado
    // -> el chequeo no aplica, no bloquea (mismo comportamiento que hoy, no
    // obliga a completar datos).
    const hasAnyIncome = customerIncome != null || guarantorIncome > 0;
    if (!hasAnyIncome || maxIncomePercentage == null) {
      return {
        applicable: false,
        customerIncome,
        guarantorIncome,
        monthlyIncome: customerIncome,
        maxIncomePercentage,
        maxAllowed: null,
        currentCommitment: 0,
        proposedMonthlyPayment,
        available: null,
        exceeds: false,
      };
    }

    const activeLoans = await this.prisma.loan.findMany({
      where: { tenantId, customerId, status: 'ACTIVE' },
      select: { totalAmount: true, totalInstallments: true },
    });
    const currentCommitment = activeLoans.reduce(
      (sum, loan) => sum + toNum(loan.totalAmount) / loan.totalInstallments,
      0,
    );

    const monthlyIncome = (customerIncome ?? 0) + guarantorIncome;
    const maxAllowed = monthlyIncome * (maxIncomePercentage / 100);
    const available = maxAllowed - currentCommitment;
    const exceeds = proposedMonthlyPayment > available;

    return {
      applicable: true,
      customerIncome,
      guarantorIncome,
      monthlyIncome,
      maxIncomePercentage,
      maxAllowed,
      currentCommitment,
      proposedMonthlyPayment,
      available,
      exceeds,
    };
  }

  // required: si hay que pedirle al analista que registre una verificación
  // ahora. latestResult: el resultado de la última verificación relevante
  // (para decidir si bloquea la aprobación), independiente de `required`.
  async getBureauCheckStatus(
    tenantId: string,
    customerId: string,
    saleOrderId: string,
  ): Promise<BureauCheckStatus> {
    const config = await this.prisma.creditBureauConfig.findUnique({
      where: { tenantId },
    });
    if (!config?.isEnabled) {
      return { required: false, latestResult: null };
    }

    if (config.checkFrequency === 'EVERY_REQUEST') {
      const check = await this.prisma.creditBureauCheck.findFirst({
        where: { tenantId, saleOrderId },
        orderBy: { createdAt: 'desc' },
      });
      return {
        required: !check,
        latestResult: (check?.result as 'CLEAN' | 'FLAGGED') ?? null,
      };
    }

    // FIRST_PURCHASE_ONLY — si ya tuvo un préstamo alguna vez, ya fue
    // evaluado en el pasado (con o sin esta función activa) — no se le
    // vuelve a pedir ni se lo bloquea retroactivamente.
    const hasLoan = await this.prisma.loan.findFirst({
      where: { tenantId, customerId },
      select: { id: true },
    });
    if (hasLoan) return { required: false, latestResult: null };

    const check = await this.prisma.creditBureauCheck.findFirst({
      where: { tenantId, customerId },
      orderBy: { createdAt: 'desc' },
    });
    return {
      required: !check,
      latestResult: (check?.result as 'CLEAN' | 'FLAGGED') ?? null,
    };
  }
}
