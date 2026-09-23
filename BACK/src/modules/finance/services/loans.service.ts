import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PaymentMethod, PaymentReceiptItemKind, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { FinanceSourcesRepository } from '../repositories/finance-sources.repository';
import { InstallmentsRepository } from '../repositories/installments.repository';
import { LoansRepository } from '../repositories/loans.repository';
import { PaymentReceiptsRepository } from '../repositories/payment-receipts.repository';
import type { PayInstallmentDto } from '../dto/pay-installment.dto';
import type { PayInstallmentsDto } from '../dto/pay-installments.dto';
import type { AdvancePaymentDto } from '../dto/advance-payment.dto';
import type { AuditLogEvent } from '../../../audit/audit-log.event';

interface ReceiptItemInput {
  installmentId: string;
  installmentNumber: number;
  amountApplied: number;
  kind?: PaymentReceiptItemKind;
  componentName?: string;
}

interface OpenCharge {
  id: string;
  installmentId: string;
  amount: number;
  componentName: string;
}

// Todo esto opera en UTC a propósito, nunca con los getters/setters locales
// (getMonth/setMonth/getDate) — esas fechas de vencimiento son "fechas de
// calendario" puras (el día 5, el día 20), no un instante con hora. Un
// `dueDate` ya se guarda/recibe en UTC (una fecha "YYYY-MM-DD" del frontend
// se parsea como medianoche UTC per ECMA-262), y el proceso de Node corre
// sin `TZ` fijado — si alguna vez corre en un host con timezone local
// distinto de UTC, `setMonth`/`getDate` habrían corrido la fecha guardada
// un día, exactamente el bug reportado ("día 5" guardado quedaba en "día 4").
function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

// Todas las cuotas vencen el mismo día del mes configurado por el tenant
// (CreditConfig.dueDayOfMonth), no en el aniversario de la fecha de compra
// — todos los clientes comparten un único ciclo de facturación. Siempre
// tiene que haber al menos un mes completo de plazo antes del primer
// vencimiento: si el día de compra ya pasó el día de corte del próximo mes,
// se salta un mes más (ej: compra 31/jul con corte día 5 -> primera cuota
// 05/sep, no 05/ago, que quedaría a solo 5 días).
function computeFirstDueDate(purchaseDate: Date, dueDayOfMonth: number): Date {
  const monthsAhead = purchaseDate.getUTCDate() > dueDayOfMonth ? 2 : 1;
  return new Date(
    Date.UTC(
      purchaseDate.getUTCFullYear(),
      purchaseDate.getUTCMonth() + monthsAhead,
      dueDayOfMonth,
    ),
  );
}

function toNum(value: unknown): number {
  if (typeof value === 'object' && value !== null && 'toNumber' in value) {
    return (value as { toNumber(): number }).toNumber();
  }
  return Number(value);
}

@Injectable()
export class LoansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loansRepository: LoansRepository,
    private readonly installmentsRepository: InstallmentsRepository,
    private readonly eventEmitter: EventEmitter2,
    private readonly receiptsRepository: PaymentReceiptsRepository,
    private readonly sources: FinanceSourcesRepository,
  ) {}

  findAll(tenantId: string) {
    return this.loansRepository.findAll(tenantId);
  }

  async findOne(tenantId: string, id: string) {
    const loan = await this.loansRepository.findById(tenantId, id);
    if (!loan) throw new NotFoundException('Préstamo no encontrado');
    return this.withMoraPolicy(tenantId, loan);
  }

  async findByOrder(tenantId: string, saleOrderId: string) {
    const loan = await this.loansRepository.findBySaleOrder(
      tenantId,
      saleOrderId,
    );
    if (!loan)
      throw new NotFoundException('No existe un préstamo para este pedido');
    return this.withMoraPolicy(tenantId, loan);
  }

  private async withMoraPolicy<T extends object>(tenantId: string, loan: T) {
    const policy = await this.sources.findMoraPolicy(tenantId);
    return {
      ...loan,
      moraPolicy: {
        graceDays: policy?.moraGraceDays ?? 0,
        components: (policy?.interestComponents ?? []).map((component) => ({
          name: component.name,
          frequency: component.frequency,
          percentage: toNum(component.percentage),
        })),
      },
    };
  }

  findOverdueInstallments(tenantId: string) {
    return this.installmentsRepository.findOverdue(tenantId);
  }

  async findReceiptById(tenantId: string, id: string) {
    const receipt = await this.receiptsRepository.findById(tenantId, id);
    if (!receipt) throw new NotFoundException('Recibo no encontrado');
    return receipt;
  }

  // Una cuota puede haberse cobrado sola (payInstallment) o como parte de un
  // pago que también tocó otras cuotas (payByAmount) — en ambos casos hay
  // exactamente un recibo con un PaymentReceiptItem para esta cuota.
  async findReceiptByInstallment(tenantId: string, installmentId: string) {
    const receipt = await this.receiptsRepository.findLatestByInstallment(
      tenantId,
      installmentId,
    );
    if (!receipt)
      throw new NotFoundException('No hay recibo generado para esta cuota');
    return receipt;
  }

  // Comprobante de dinero recibido — se genera siempre junto con el pago
  // (misma transacción), nunca por separado. Numeración oficial de 13
  // dígitos (establecimiento-puntoExpedición-secuencial) pero el secuencial
  // lo autogenera el sistema, no es un documento fiscal SET.
  private async createPaymentReceipt(
    tx: Prisma.TransactionClient,
    tenantId: string,
    params: {
      loanId: string;
      customerId: string;
      branchId: string | null;
      items: ReceiptItemInput[];
      totalAmount: number;
      paymentMethod: PaymentMethod;
      paymentReference?: string | null;
      collectedById?: string | null;
    },
  ) {
    let establecimiento = '001';
    let puntoExpedicion = '001';
    if (params.branchId) {
      const branch = await this.sources.findBranchNumbering(
        tenantId,
        params.branchId,
        tx,
      );
      establecimiento = branch?.codigoEstablecimiento || '001';
      puntoExpedicion = branch?.puntoExpedicion || '001';
    }

    const last = await this.receiptsRepository.findLastSequential(
      tenantId,
      establecimiento,
      puntoExpedicion,
      tx,
    );
    const sequential = (last?.sequential ?? 0) + 1;
    const receiptNumber = `${establecimiento}-${puntoExpedicion}-${String(sequential).padStart(7, '0')}`;

    return this.receiptsRepository.create(
      {
        tenantId,
        loanId: params.loanId,
        customerId: params.customerId,
        branchId: params.branchId,
        establecimiento,
        puntoExpedicion,
        sequential,
        receiptNumber,
        totalAmount: params.totalAmount,
        paymentMethod: params.paymentMethod,
        paymentReference: params.paymentReference ?? null,
        collectedById: params.collectedById ?? null,
        items: {
          create: params.items.map((i) => ({
            installmentId: i.installmentId,
            installmentNumber: i.installmentNumber,
            amountApplied: i.amountApplied,
            kind: i.kind ?? 'PRINCIPAL',
            componentName: i.componentName ?? null,
          })),
        },
      },
      tx,
    );
  }

  // Cargos de interés/mora vigentes (InstallmentInterestCharge, amount > 0)
  // de un grupo de cuotas, agrupados por cuota — usado antes de aplicar un
  // pago, tanto para validar el saldo total (capital + recargos) como para
  // saber qué descontar primero.
  private async getOpenCharges(
    installmentIds: string[],
  ): Promise<Map<string, OpenCharge[]>> {
    const rows =
      await this.installmentsRepository.findOpenChargesByInstallments(
        installmentIds,
      );
    const map = new Map<string, OpenCharge[]>();
    for (const row of rows) {
      const list = map.get(row.installmentId) ?? [];
      list.push({
        id: row.id,
        installmentId: row.installmentId,
        amount: toNum(row.amount),
        componentName: row.component.name,
      });
      map.set(row.installmentId, list);
    }
    return map;
  }

  // Aplica hasta `amountAvailable` sobre una cuota: primero descuenta sus
  // cargos de interés/mora abiertos (gastos administrativos, mora, etc., en
  // el orden configurado por el tenant), y el remanente va al capital de la
  // cuota — criterio contable estándar (recargos antes que capital). Nunca
  // aplica más de lo que la cuota realmente debe (capital + cargos), sin
  // importar cuánto traiga `amountAvailable`. Devuelve los ReceiptItemInput
  // generados (uno por cada cargo efectivamente cobrado + uno de capital si
  // corresponde), cuánto se usó realmente (`applied`, para que el caller
  // sepa cuánto le queda disponible para otras cuotas), y si la cuota quedó
  // 100% saldada (capital y todos sus cargos en cero).
  private async applyPaymentToInstallment(
    tx: Prisma.TransactionClient,
    inst: { id: string; number: number; amount: unknown; paidAmount: unknown },
    charges: OpenCharge[],
    amountAvailable: number,
    paymentMethod: PaymentMethod,
    paymentDate: Date,
    notes?: string,
    paymentReference?: string,
  ): Promise<{
    items: ReceiptItemInput[];
    applied: number;
    fullyPaid: boolean;
    updatedInstallment?: Awaited<
      ReturnType<Prisma.TransactionClient['installment']['update']>
    >;
  }> {
    const principalAmount = toNum(inst.amount);
    const currentPaid = toNum(inst.paidAmount);
    const principalOutstanding = principalAmount - currentPaid;
    const chargesOutstanding = charges.reduce((s, c) => s + c.amount, 0);
    const totalOutstanding = principalOutstanding + chargesOutstanding;

    const toApply = Math.max(0, Math.min(amountAvailable, totalOutstanding));
    if (toApply <= 0) {
      return {
        items: [],
        applied: 0,
        fullyPaid: principalOutstanding <= 0 && chargesOutstanding <= 0,
      };
    }

    let remaining = toApply;
    const items: ReceiptItemInput[] = [];

    for (const charge of charges) {
      if (remaining <= 0) break;
      const pay = Math.min(remaining, charge.amount);
      if (pay <= 0) continue;
      await this.installmentsRepository.updateChargeAmount(
        charge.id,
        charge.amount - pay,
        tx,
      );
      items.push({
        installmentId: inst.id,
        installmentNumber: inst.number,
        amountApplied: pay,
        kind: PaymentReceiptItemKind.INTEREST_COMPONENT,
        componentName: charge.componentName,
      });
      remaining -= pay;
      charge.amount -= pay;
    }

    const principalPayment = Math.min(remaining, principalOutstanding);
    const newPaid = currentPaid + principalPayment;
    remaining -= principalPayment;

    const chargesRemaining = charges.reduce((s, c) => s + c.amount, 0);
    const fullyPaid = newPaid >= principalAmount && chargesRemaining <= 0;

    const updatedInstallment = await this.installmentsRepository.update(
      inst.id,
      {
        paidAmount: newPaid,
        paidAt: fullyPaid ? paymentDate : undefined,
        paymentMethod,
        paymentDate,
        paymentReference,
        // Solo se marca PARTIAL si algo del pago realmente tocó el capital
        // — si un cobro se aplicó únicamente a un recargo (mora/gastos) sin
        // abonar nada del capital, la cuota en sí sigue como estaba.
        status: fullyPaid
          ? 'PAID'
          : principalPayment > 0
            ? 'PARTIAL'
            : undefined,
        notes,
      },
      tx,
    );

    if (principalPayment > 0) {
      items.push({
        installmentId: inst.id,
        installmentNumber: inst.number,
        amountApplied: principalPayment,
        kind: PaymentReceiptItemKind.PRINCIPAL,
      });
    }

    return { items, applied: toApply, fullyPaid, updatedInstallment };
  }

  async createFromOrder(tenantId: string, saleOrderId: string) {
    // Idempotent: skip if loan already exists for this order
    const existing = await this.loansRepository.findBySaleOrder(
      tenantId,
      saleOrderId,
    );
    if (existing) return existing;

    const order = await this.sources.findSaleOrderWithItems(
      tenantId,
      saleOrderId,
    );
    if (!order)
      throw new NotFoundException(`Sale order ${saleOrderId} not found`);
    if (!order.installments || order.installments < 1) {
      throw new UnprocessableEntityException(
        'El pedido no tiene cuotas configuradas para generar un préstamo',
      );
    }

    const itemsTotal = order.items.reduce((sum, item) => {
      return sum + toNum(item.unitPrice) * item.quantity;
    }, 0);

    // El recargo de entrega/zona también se financia — el preview del
    // frontend en el modal "Nuevo pedido" ya lo incluye en su estimado, el
    // préstamo real tiene que coincidir con eso.
    const surcharge = order.surchargeAmount
      ? order.surchargeType === 'FIXED'
        ? toNum(order.surchargeAmount)
        : itemsTotal * (toNum(order.surchargeAmount) / 100)
      : 0;
    const principal = itemsTotal + surcharge;

    const interestRate = order.interestRate ? toNum(order.interestRate) : 0;
    const totalAmount = principal * (1 + interestRate / 100);
    const amountPerInstallment = Math.round(totalAmount / order.installments);
    const now = new Date();

    const dueDayOfMonth = await this.sources.findDueDayOfMonth(tenantId);
    const firstDueDate = computeFirstDueDate(now, dueDayOfMonth ?? 5);

    return this.prisma.$transaction(async (tx) => {
      const loan = await this.loansRepository.createBare(
        {
          tenantId,
          saleOrderId,
          customerId: order.customerId,
          principal,
          interestRate,
          totalAmount,
          totalInstallments: order.installments!,
        },
        tx,
      );

      for (let i = 1; i <= order.installments!; i++) {
        await this.installmentsRepository.create(
          {
            tenantId,
            loanId: loan.id,
            number: i,
            dueDate: addMonths(firstDueDate, i - 1),
            amount: amountPerInstallment,
          },
          tx,
        );
      }

      return this.loansRepository.findWithSchedule(loan.id, tx);
    });
  }

  // Al emitir la factura de una venta a crédito, el vendedor puede elegir un
  // vencimiento distinto al día default del tenant — pero el préstamo y sus
  // cuotas ya se crearon antes, al aprobar el crédito (createFromOrder). Acá
  // se corre la reprogramación completa del cronograma a partir de esa fecha,
  // preservando el mismo patrón mensual. Nunca toca una cuota ya pagada —
  // en la práctica esto siempre corre con todo pendiente, porque la factura
  // se emite una única vez, justo después de la aprobación.
  async rescheduleInstallments(
    tenantId: string,
    saleOrderId: string,
    newFirstDueDate: Date,
  ) {
    const loan = await this.loansRepository.findScheduleBySaleOrder(
      tenantId,
      saleOrderId,
    );
    if (!loan) return; // venta al contado, no hay préstamo que reprogramar

    const current = loan.installments[0];
    if (!current || isSameDay(current.dueDate, newFirstDueDate)) return;
    if (loan.installments.some((i) => i.status === 'PAID')) return;

    await this.prisma.$transaction(async (tx) => {
      for (const inst of loan.installments) {
        await this.installmentsRepository.update(
          inst.id,
          { dueDate: addMonths(newFirstDueDate, inst.number - 1) },
          tx,
        );
      }
    });
  }

  async payInstallment(
    tenantId: string,
    installmentId: string,
    dto: PayInstallmentDto,
    userId?: string,
  ) {
    const installment = await this.installmentsRepository.findById(
      tenantId,
      installmentId,
    );
    if (!installment) throw new NotFoundException('Cuota no encontrada');
    if (installment.status === 'PAID') {
      throw new UnprocessableEntityException('Esta cuota ya fue pagada');
    }

    const charges =
      (await this.getOpenCharges([installmentId])).get(installmentId) ?? [];
    const principalOutstanding =
      toNum(installment.amount) - toNum(installment.paidAmount);
    const chargesOutstanding = charges.reduce((s, c) => s + c.amount, 0);
    // ceiling caps overpayment against fractional Decimal values (e.g.
    // 1221875/6 = 203645.83), same criterio que antes, ahora incluyendo
    // recargos vigentes en el saldo total.
    const ceiling = Math.ceil(principalOutstanding + chargesOutstanding);

    if (dto.amount > ceiling) {
      throw new UnprocessableEntityException(
        `El monto abonado (${dto.amount}) supera el saldo de la cuota (${ceiling})`,
      );
    }

    const paymentDate = dto.paymentDate
      ? new Date(dto.paymentDate)
      : new Date();

    const { fullyPaid, updatedInstallment, receipt } =
      await this.prisma.$transaction(async (tx) => {
        const { items, fullyPaid, updatedInstallment } =
          await this.applyPaymentToInstallment(
            tx,
            installment,
            charges,
            dto.amount,
            dto.paymentMethod,
            paymentDate,
            dto.notes,
            dto.paymentReference,
          );

        const receipt = await this.createPaymentReceipt(tx, tenantId, {
          loanId: installment.loanId,
          customerId: installment.loan.customerId,
          branchId: installment.loan.saleOrder.branchId,
          items,
          totalAmount: dto.amount,
          paymentMethod: dto.paymentMethod,
          paymentReference: dto.paymentReference,
          collectedById: userId,
        });

        return { fullyPaid, updatedInstallment, receipt };
      });

    this.eventEmitter.emit('installment.paid', {
      tenantId,
      loanId: installment.loanId,
      saleOrderId: installment.loan.saleOrderId,
      installmentId,
      amount: dto.amount,
    });

    if (fullyPaid) {
      await this.checkAndCloseLoan(tenantId, installment.loanId);
    }

    const finalReceipt = await this.emitReceiptCreatedAndRefetch(
      tenantId,
      receipt,
    );
    return { installment: updatedInstallment, receipt: finalReceipt };
  }

  // Genera el PDF del recibo fuera de la transacción (Puppeteer no debe correr
  // con una transacción de Postgres abierta) y espera a que termine
  // (emitAsync) para poder devolver pdfFileId ya listo en la misma respuesta.
  private async emitReceiptCreatedAndRefetch(
    tenantId: string,
    receipt: Awaited<ReturnType<LoansService['createPaymentReceipt']>>,
  ) {
    await this.eventEmitter.emitAsync('payment.receipt.created', {
      tenantId,
      receiptId: receipt.id,
    });
    return this.findReceiptById(tenantId, receipt.id);
  }

  // Distributes amount across oldest-first pending installments (regular payment)
  async payByAmount(
    tenantId: string,
    loanId: string,
    dto: {
      amount: number;
      paymentMethod: string;
      paymentDate?: string;
      paymentReference?: string;
      notes?: string;
    },
    userId?: string,
  ) {
    const loan = await this.findOne(tenantId, loanId);
    if (loan.status === 'PAID') {
      throw new UnprocessableEntityException(
        'El préstamo ya está completamente pagado',
      );
    }

    const pending = await this.installmentsRepository.findPendingByLoan(
      tenantId,
      loanId,
    );
    if (!pending.length) {
      throw new UnprocessableEntityException(
        'No hay cuotas pendientes para imputar',
      );
    }

    const chargesByInstallment = await this.getOpenCharges(
      pending.map((i) => i.id),
    );
    const totalOutstanding = pending.reduce((s, i) => {
      const charges = chargesByInstallment.get(i.id) ?? [];
      return (
        s +
        toNum(i.amount) -
        toNum(i.paidAmount) +
        charges.reduce((cs, c) => cs + c.amount, 0)
      );
    }, 0);
    if (dto.amount > totalOutstanding) {
      throw new UnprocessableEntityException(
        `El monto (${dto.amount}) supera el saldo pendiente total (${totalOutstanding})`,
      );
    }

    const paymentDate = dto.paymentDate
      ? new Date(dto.paymentDate)
      : new Date();

    const receipt = await this.prisma.$transaction(async (tx) => {
      let remaining = dto.amount;
      const items: ReceiptItemInput[] = [];
      for (const inst of pending) {
        if (remaining <= 0) break;
        const charges = chargesByInstallment.get(inst.id) ?? [];
        const result = await this.applyPaymentToInstallment(
          tx,
          inst,
          charges,
          remaining,
          dto.paymentMethod as PaymentMethod,
          paymentDate,
          dto.notes,
        );
        items.push(...result.items);
        remaining -= result.applied;
      }

      return this.createPaymentReceipt(tx, tenantId, {
        loanId,
        customerId: loan.customerId,
        branchId: loan.saleOrder.branchId,
        items,
        totalAmount: dto.amount,
        paymentMethod: dto.paymentMethod as PaymentMethod,
        paymentReference: dto.paymentReference,
        collectedById: userId,
      });
    });

    this.eventEmitter.emit('audit.log', {
      tenantId,
      module: 'finance',
      action: 'loan.payment.registered',
      resourceId: loanId,
    } satisfies AuditLogEvent);

    await this.checkAndCloseLoan(tenantId, loanId);
    const updatedLoan = await this.loansRepository.findById(tenantId, loanId);
    const finalReceipt = await this.emitReceiptCreatedAndRefetch(
      tenantId,
      receipt,
    );
    return { loan: updatedLoan, receipt: finalReceipt };
  }

  // Cobra una selección explícita de cuotas (elegidas a mano, o calculadas en
  // el frontend a partir de un monto — ver front/lib/finance-distribute.ts)
  // en un solo recibo. A diferencia de payByAmount, acá el caller decide
  // exactamente qué cuotas y cuánto se aplica a cada una — no siempre las
  // más antiguas primero ni siempre el saldo completo.
  async payInstallments(
    tenantId: string,
    loanId: string,
    dto: PayInstallmentsDto,
    userId?: string,
  ) {
    const loan = await this.findOne(tenantId, loanId);
    if (loan.status === 'PAID') {
      throw new UnprocessableEntityException(
        'El préstamo ya está completamente pagado',
      );
    }

    const pending = await this.installmentsRepository.findPendingByLoan(
      tenantId,
      loanId,
    );
    const pendingById = new Map(pending.map((i) => [i.id, i]));
    const chargesByInstallment = await this.getOpenCharges(
      dto.items.map((i) => i.installmentId),
    );

    for (const item of dto.items) {
      const inst = pendingById.get(item.installmentId);
      if (!inst) {
        throw new UnprocessableEntityException(
          `La cuota ${item.installmentId} no pertenece a este préstamo o ya está pagada`,
        );
      }
      const charges = chargesByInstallment.get(item.installmentId) ?? [];
      const outstanding =
        Math.ceil(toNum(inst.amount)) -
        toNum(inst.paidAmount) +
        charges.reduce((s, c) => s + c.amount, 0);
      if (item.amount > outstanding) {
        throw new UnprocessableEntityException(
          `El monto para la cuota #${inst.number} (${item.amount}) supera su saldo (${outstanding})`,
        );
      }
    }

    const paymentDate = dto.paymentDate
      ? new Date(dto.paymentDate)
      : new Date();

    const receipt = await this.prisma.$transaction(async (tx) => {
      const items: ReceiptItemInput[] = [];
      for (const item of dto.items) {
        const inst = pendingById.get(item.installmentId)!;
        const charges = chargesByInstallment.get(item.installmentId) ?? [];
        const result = await this.applyPaymentToInstallment(
          tx,
          inst,
          charges,
          item.amount,
          dto.paymentMethod,
          paymentDate,
          dto.notes,
        );
        items.push(...result.items);
      }

      return this.createPaymentReceipt(tx, tenantId, {
        loanId,
        customerId: loan.customerId,
        branchId: loan.saleOrder.branchId,
        items,
        totalAmount: dto.items.reduce((s, i) => s + i.amount, 0),
        paymentMethod: dto.paymentMethod,
        paymentReference: dto.paymentReference,
        collectedById: userId,
      });
    });

    this.eventEmitter.emit('audit.log', {
      tenantId,
      module: 'finance',
      action: 'loan.payment.registered',
      resourceId: loanId,
    } satisfies AuditLogEvent);

    await this.checkAndCloseLoan(tenantId, loanId);
    const updatedLoan = await this.loansRepository.findById(tenantId, loanId);
    const finalReceipt = await this.emitReceiptCreatedAndRefetch(
      tenantId,
      receipt,
    );
    return { loan: updatedLoan, receipt: finalReceipt };
  }

  // Advance payment: REDUCE_INSTALLMENTS cancels from end; REDUCE_AMOUNT redistributes balance
  async advancePayment(
    tenantId: string,
    loanId: string,
    dto: AdvancePaymentDto,
    userId?: string,
  ) {
    const loan = await this.findOne(tenantId, loanId);
    if (loan.status === 'PAID') {
      throw new UnprocessableEntityException(
        'El préstamo ya está completamente pagado',
      );
    }

    const pending = await this.installmentsRepository.findPendingByLoan(
      tenantId,
      loanId,
    );
    if (!pending.length) {
      throw new UnprocessableEntityException('No hay cuotas pendientes');
    }

    const chargesByInstallment = await this.getOpenCharges(
      pending.map((i) => i.id),
    );
    const principalOutstanding = pending.reduce(
      (s, i) => s + toNum(i.amount) - toNum(i.paidAmount),
      0,
    );
    const chargesOutstandingTotal = [...chargesByInstallment.values()].reduce(
      (s, list) => s + list.reduce((cs, c) => cs + c.amount, 0),
      0,
    );
    const totalOutstanding = principalOutstanding + chargesOutstandingTotal;
    if (dto.amount > totalOutstanding) {
      throw new UnprocessableEntityException(
        `El adelanto (${dto.amount}) supera el saldo pendiente total (${totalOutstanding})`,
      );
    }

    const paymentDate = dto.paymentDate
      ? new Date(dto.paymentDate)
      : new Date();

    let receipt: Awaited<
      ReturnType<LoansService['createPaymentReceipt']>
    > | null = null;

    if (dto.mode === 'REDUCE_INSTALLMENTS') {
      // Apply from last installment backwards — cancels end cuotas first
      const reversed = [...pending].reverse();
      receipt = await this.prisma.$transaction(async (tx) => {
        let remaining = dto.amount;
        const items: ReceiptItemInput[] = [];
        for (const inst of reversed) {
          if (remaining <= 0) break;
          const charges = chargesByInstallment.get(inst.id) ?? [];
          const result = await this.applyPaymentToInstallment(
            tx,
            inst,
            charges,
            remaining,
            dto.paymentMethod,
            paymentDate,
            dto.notes,
          );
          items.push(...result.items);
          remaining -= result.applied;
        }

        return this.createPaymentReceipt(tx, tenantId, {
          loanId,
          customerId: loan.customerId,
          branchId: loan.saleOrder.branchId,
          items,
          totalAmount: dto.amount,
          paymentMethod: dto.paymentMethod,
          paymentReference: dto.reference,
          collectedById: userId,
        });
      });
    } else {
      // REDUCE_AMOUNT no genera recibo — no aplica un pago a cuotas
      // puntuales, recalcula el saldo restante entre todas por igual. No
      // toca InstallmentInterestCharge (son ajenos a `amount`), así que se
      // exige que no haya recargos vigentes antes de permitir este modo —
      // mismo criterio que ya exige que no haya cuotas PARTIAL.
      const hasPartial = pending.some((i) => i.status === 'PARTIAL');
      if (hasPartial) {
        throw new UnprocessableEntityException(
          'Existe una cuota parcialmente pagada. Finalice su pago antes de realizar un adelanto con reducción de monto.',
        );
      }
      if (chargesOutstandingTotal > 0) {
        throw new UnprocessableEntityException(
          'Hay recargos de mora/interés pendientes. Cóbrelos antes de realizar un adelanto con reducción de monto.',
        );
      }

      const newOutstanding = principalOutstanding - dto.amount;
      const count = pending.length;
      const baseAmount = Math.floor(newOutstanding / count);
      const remainder = newOutstanding - baseAmount * count;

      await this.prisma.$transaction(async (tx) => {
        for (let i = 0; i < count; i++) {
          const inst = pending[i];
          const isLast = i === count - 1;
          const newAmount = baseAmount + (isLast ? remainder : 0);
          await this.installmentsRepository.update(
            inst.id,
            { amount: newAmount, paidAmount: 0, status: 'PENDING' },
            tx,
          );
        }
      });
    }

    this.eventEmitter.emit('audit.log', {
      tenantId,
      module: 'finance',
      action: 'loan.advance.paid',
      resourceId: loanId,
    } satisfies AuditLogEvent);

    await this.checkAndCloseLoan(tenantId, loanId);
    const updatedLoan = await this.loansRepository.findById(tenantId, loanId);
    const finalReceipt = receipt
      ? await this.emitReceiptCreatedAndRefetch(tenantId, receipt)
      : null;
    return { loan: updatedLoan, receipt: finalReceipt };
  }

  private async checkAndCloseLoan(tenantId: string, loanId: string) {
    const all = await this.installmentsRepository.findByLoan(tenantId, loanId);
    if (all.every((i) => i.status === 'PAID')) {
      await this.loansRepository.updateStatus(loanId, 'PAID');
      this.eventEmitter.emit('loan.paid', { tenantId, loanId });
    }
  }
}
