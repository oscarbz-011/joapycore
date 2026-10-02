import { Injectable } from '@nestjs/common';
import { CreditSourcesRepository } from '../repositories/credit-sources.repository';
import {
  DEFAULT_RATING_DELAY_THRESHOLDS,
  averageDelayDays,
  installmentDelayDays,
  scoreFromAverageDelay,
  type CreditScore,
} from './credit-score';

function toNum(value: unknown): number {
  if (typeof value === 'object' && value !== null && 'toNumber' in value) {
    return (value as { toNumber(): number }).toNumber();
  }
  return Number(value);
}

export type LoanHistoryStatus = 'ACTIVE' | 'PAID';

export interface InstallmentDetail {
  number: number;
  dueDate: Date;
  amount: number;
  paidAmount: number;
  balance: number;
  paidAt: Date | null;
  status: string;
  // null = todavía no venció y no está pagada: no se puede evaluar.
  delayDays: number | null;
}

export interface LoanSummary {
  loanId: string;
  status: LoanHistoryStatus;
  // Factura de la venta que originó el crédito (null si todavía no se emitió).
  invoiceId: string | null;
  invoiceNumber: string | null;
  productNames: string[];
  totalAmount: number;
  paidAmount: number;
  outstandingBalance: number;
  monthlyInstallment: number;
  installmentsPaid: number;
  totalInstallments: number;
  startDate: Date;
  firstDueDate: Date | null;
  finalDueDate: Date | null;
  nextDueDate: Date | null;
  averageDelayDays: number | null;
  maxDelayDays: number;
  lateInstallments: number;
  installments: InstallmentDetail[];
}

export interface CreditHistory {
  // null = sin historial evaluable (nunca tuvo una cuota vencida o pagada).
  score: CreditScore | null;
  averageDelayDays: number | null;
  uncollectible: {
    // Marca manual vigente, con su motivo.
    manual: { markedAt: Date; reason: string | null } | null;
    // Una cuota impaga superó los días configurados por el tenant.
    automatic: boolean;
  };
  activeLoans: LoanSummary[];
  finishedLoans: LoanSummary[];
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

function evaluatedDelays(installments: InstallmentDetail[]): number[] {
  return installments
    .map((installment) => installment.delayDays)
    .filter((days): days is number => days !== null);
}

// Servicio de solo-lectura: agrega el historial crediticio de un cliente
// (otros préstamos activos, morosidad, calificación interna) y la capacidad
// de pago por sueldo, para que el analista los vea antes de aprobar un
// crédito. Separado de SaleOrdersService para no seguir infl ándolo — este
// no muta nada, solo lee y calcula.
@Injectable()
export class CreditEvaluationService {
  constructor(private readonly creditSources: CreditSourcesRepository) {}

  async getCustomerCreditHistory(
    tenantId: string,
    customerId: string,
    today: Date = new Date(),
  ): Promise<CreditHistory> {
    const [allLoans, config, mark] = await Promise.all([
      this.creditSources.findLoanHistory(tenantId, customerId),
      this.creditSources.findRatingConfig(tenantId),
      this.creditSources.findCustomerUncollectibleMark(tenantId, customerId),
    ]);
    // Un préstamo anulado nunca se cobró: no habla del comportamiento de pago.
    const loans = allLoans.filter((loan) => loan.status !== 'CANCELLED');

    const summaries = loans.map((loan): LoanSummary => {
      const installments = loan.installments.map((inst): InstallmentDetail => {
        const amount = toNum(inst.amount);
        const paidAmount = toNum(inst.paidAmount);
        return {
          number: inst.number,
          dueDate: inst.dueDate,
          amount,
          paidAmount,
          balance: Math.max(amount - paidAmount, 0),
          paidAt: inst.paidAt,
          status: inst.status,
          delayDays: installmentDelayDays(inst, today),
        };
      });
      const paidAmount = installments.reduce((sum, i) => sum + i.paidAmount, 0);
      const delays = evaluatedDelays(installments);
      // installments viene ordenado por number asc — la primera y la última
      // marcan el rango real de vencimientos, distinto de la fecha de compra
      // (startDate) y del próximo vencimiento pendiente (nextDueDate).
      const first = installments[0];
      const last = installments[installments.length - 1];
      return {
        loanId: loan.id,
        status: loan.status === 'PAID' ? 'PAID' : 'ACTIVE',
        invoiceId: loan.saleOrder.invoice?.id ?? null,
        invoiceNumber: loan.saleOrder.invoice?.invoiceNumber ?? null,
        productNames: loan.saleOrder.items.map(
          (i) => i.product?.name ?? i.description ?? '—',
        ),
        totalAmount: toNum(loan.totalAmount),
        paidAmount,
        outstandingBalance: Math.max(toNum(loan.totalAmount) - paidAmount, 0),
        monthlyInstallment: first
          ? first.amount
          : toNum(loan.totalAmount) / loan.totalInstallments,
        installmentsPaid: installments.filter((i) => i.status === 'PAID')
          .length,
        totalInstallments: loan.totalInstallments,
        startDate: loan.createdAt,
        firstDueDate: first?.dueDate ?? null,
        finalDueDate: last?.dueDate ?? null,
        nextDueDate:
          installments.find((i) => i.status !== 'PAID')?.dueDate ?? null,
        averageDelayDays: averageDelayDays(delays),
        maxDelayDays: Math.max(0, ...delays),
        lateInstallments: delays.filter((days) => days > 0).length,
        installments,
      };
    });

    const allInstallments = summaries.flatMap((loan) => loan.installments);
    const overdue = allInstallments.filter((i) => i.status === 'OVERDUE');
    const average = averageDelayDays(evaluatedDelays(allInstallments));

    const limit = config?.uncollectibleAfterDays ?? null;
    const automatic =
      limit !== null &&
      allInstallments.some(
        (i) =>
          i.status !== 'PAID' && i.delayDays !== null && i.delayDays > limit,
      );
    const manual = mark?.uncollectibleAt
      ? { markedAt: mark.uncollectibleAt, reason: mark.uncollectibleReason }
      : null;

    let score: CreditScore | null = null;
    if (manual || automatic) score = 6;
    else if (average !== null) {
      score = scoreFromAverageDelay(
        average,
        config?.ratingDelayThresholds ?? DEFAULT_RATING_DELAY_THRESHOLDS,
      );
    }

    return {
      score,
      averageDelayDays: average,
      uncollectible: { manual, automatic },
      activeLoans: summaries.filter((loan) => loan.status === 'ACTIVE'),
      finishedLoans: summaries.filter((loan) => loan.status === 'PAID'),
      overdueCount: overdue.length,
      overdueAmount: overdue.reduce((sum, i) => sum + i.balance, 0),
    };
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
      this.creditSources.findCustomerIncome(tenantId, customerId),
      this.creditSources.findMaxIncomePercentage(tenantId),
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

    const activeLoans = await this.creditSources.findActiveLoanTerms(
      tenantId,
      customerId,
    );
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
    const config = await this.creditSources.findBureauConfig(tenantId);
    if (!config?.isEnabled) {
      return { required: false, latestResult: null };
    }

    if (config.checkFrequency === 'EVERY_REQUEST') {
      const check = await this.creditSources.findLatestBureauCheckForOrder(
        tenantId,
        saleOrderId,
      );
      return {
        required: !check,
        latestResult: (check?.result as 'CLEAN' | 'FLAGGED') ?? null,
      };
    }

    // FIRST_PURCHASE_ONLY — si ya tuvo un préstamo alguna vez, ya fue
    // evaluado en el pasado (con o sin esta función activa) — no se le
    // vuelve a pedir ni se lo bloquea retroactivamente.
    const hasLoan = await this.creditSources.customerHasLoan(
      tenantId,
      customerId,
    );
    if (hasLoan) return { required: false, latestResult: null };

    const check = await this.creditSources.findLatestBureauCheckForCustomer(
      tenantId,
      customerId,
    );
    return {
      required: !check,
      latestResult: (check?.result as 'CLEAN' | 'FLAGGED') ?? null,
    };
  }
}
