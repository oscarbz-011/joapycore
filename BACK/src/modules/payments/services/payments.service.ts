import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../prisma/prisma.service';
import { AccountsReceivableRepository } from '../repositories/accounts-receivable.repository';
import { PaymentRecordsRepository } from '../repositories/payment-records.repository';
import { RegisterPaymentDto } from '../dto/register-payment.dto';
import type { AuditLogEvent } from '../../../audit/audit-log.event';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly arRepository: AccountsReceivableRepository,
    private readonly paymentRecordsRepository: PaymentRecordsRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  findAll(tenantId: string) {
    return this.arRepository.findAll(tenantId);
  }

  async getCollections(tenantId: string, month?: string) {
    const now = new Date();
    const year   = month ? parseInt(month.split('-')[0]) : now.getFullYear();
    const monthN = month ? parseInt(month.split('-')[1]) - 1 : now.getMonth();

    const start = new Date(year, monthN, 1);
    const end   = new Date(year, monthN + 1, 1);

    const [cashRecords, creditInstallments] = await Promise.all([
      this.prisma.paymentRecord.findMany({
        where: { tenantId, paymentDate: { gte: start, lt: end } },
        select: { amount: true, paymentMethod: true },
      }),
      this.prisma.installment.findMany({
        where: { tenantId, paidAt: { gte: start, lt: end } },
        select: { paidAmount: true, paymentMethod: true },
      }),
    ]);

    const toNum = (v: unknown): number =>
      typeof v === 'object' && v !== null && 'toNumber' in v
        ? (v as { toNumber(): number }).toNumber()
        : Number(v ?? 0);

    const aggCash: Record<string, number> = {};
    let cashTotal = 0;
    for (const r of cashRecords) {
      const a = toNum(r.amount);
      cashTotal += a;
      aggCash[r.paymentMethod] = (aggCash[r.paymentMethod] ?? 0) + a;
    }

    const aggCredit: Record<string, number> = {};
    let creditTotal = 0;
    for (const i of creditInstallments) {
      const a = toNum(i.paidAmount);
      creditTotal += a;
      const m = i.paymentMethod ?? 'UNKNOWN';
      aggCredit[m] = (aggCredit[m] ?? 0) + a;
    }

    const byMethod: Record<string, number> = { ...aggCash };
    for (const [m, v] of Object.entries(aggCredit)) {
      byMethod[m] = (byMethod[m] ?? 0) + v;
    }

    return {
      month: `${year}-${String(monthN + 1).padStart(2, '0')}`,
      total: cashTotal + creditTotal,
      cash:   { total: cashTotal,   byMethod: aggCash },
      credit: { total: creditTotal, byMethod: aggCredit },
      byMethod,
    };
  }

  async findOne(tenantId: string, id: string) {
    const ar = await this.arRepository.findById(tenantId, id);
    if (!ar) throw new NotFoundException('Cuenta por cobrar no encontrada');
    return ar;
  }

  async registerPayment(
    tenantId: string,
    arId: string,
    dto: RegisterPaymentDto,
    userId?: string,
  ) {
    const ar = await this.findOne(tenantId, arId);

    if (ar.status === 'PAID') {
      throw new UnprocessableEntityException('Esta cuenta ya fue pagada en su totalidad');
    }
    if (ar.status === 'CANCELLED') {
      throw new UnprocessableEntityException(
        'No se puede registrar un pago sobre una cuenta cancelada',
      );
    }

    const remaining = Number(ar.amount) - Number(ar.paidAmount);
    if (dto.amount > remaining + 0.01) {
      throw new UnprocessableEntityException(
        `El monto (${dto.amount}) supera el saldo pendiente (${remaining.toFixed(2)})`,
      );
    }

    // Single transaction: PaymentRecord + atomic AR increment + status update.
    // Using increment instead of read-modify-write prevents race conditions when
    // two payments arrive simultaneously for the same AR.
    let newStatus: 'PARTIAL' | 'PAID';
    let invoiceId: string;

    await this.prisma.$transaction(async (tx) => {
      await this.paymentRecordsRepository.create(
        {
          tenantId,
          accountsReceivableId: arId,
          amount: dto.amount,
          paymentMethod: dto.paymentMethod,
          paymentDate: new Date(dto.paymentDate),
          reference: dto.reference,
          notes: dto.notes,
        },
        tx,
      );

      const updated = await this.arRepository.incrementPaid(arId, dto.amount, tx);
      invoiceId = updated.invoiceId;
      newStatus =
        Number(updated.paidAmount) >= Number(updated.amount) - 0.01 ? 'PAID' : 'PARTIAL';

      await this.arRepository.updateStatus(arId, newStatus, tx);
    });

    // Emit events after transaction commits — ensures DB is consistent before listeners react.
    if (newStatus! === 'PAID') {
      this.eventEmitter.emit('payment.ar.completed', {
        tenantId,
        arId,
        invoiceId: invoiceId!,
      });
    }

    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'payments',
      action: 'payment.registered',
      resourceId: arId,
      after: { amount: dto.amount, method: dto.paymentMethod, status: newStatus! },
    } satisfies AuditLogEvent);

    return this.arRepository.findById(tenantId, arId);
  }
}
