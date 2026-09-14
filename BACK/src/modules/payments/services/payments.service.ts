import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../prisma/prisma.service';
import { AccountsReceivableRepository } from '../repositories/accounts-receivable.repository';
import { PaymentRecordsRepository } from '../repositories/payment-records.repository';
import { PaymentSourcesRepository } from '../repositories/payment-sources.repository';
import { RegisterPaymentDto } from '../dto/register-payment.dto';
import type { AuditLogEvent } from '../../../audit/audit-log.event';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly arRepository: AccountsReceivableRepository,
    private readonly paymentRecordsRepository: PaymentRecordsRepository,
    private readonly eventEmitter: EventEmitter2,
    private readonly paymentSources: PaymentSourcesRepository,
  ) {}

  findAll(tenantId: string) {
    return this.arRepository.findAll(tenantId);
  }

  async getCollections(
    tenantId: string,
    range: 'day' | 'week' | 'month' = 'month',
  ) {
    // `paymentDate`/`paidAt` son días de calendario elegidos por el usuario,
    // guardados en UTC-medianoche del día que se ve en pantalla (mismo
    // criterio que `dueDate` — ver front/lib/date.ts). "Hoy" acá NO puede
    // salir de `new Date()` con getFullYear/getMonth/getDate crudos: esos
    // getters devuelven el día según el timezone del SISTEMA OPERATIVO del
    // servidor, que no tiene por qué ser Paraguay (un server en UTC ya
    // estaría "mañana" durante la noche paraguaya) — eso desalineaba el
    // rango "Hoy" con pagos recién cargados. Se ancla explícito a
    // America/Asuncion y se reconstruye en UTC para que coincida con cómo
    // se guardó `paymentDate`.
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Asuncion',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
    }).formatToParts(new Date());
    const get = (type: string) => parts.find((p) => p.type === type)!.value;
    const year = Number(get('year'));
    const month = Number(get('month')) - 1;
    const day = Number(get('day'));
    // Intl weekday: "Mon".."Sun" — se mapea a 0=domingo..6=sábado para
    // reusar el mismo cálculo de lunes-a-domingo que ya tenía este método.
    const WEEKDAY_INDEX: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };
    const weekday = WEEKDAY_INDEX[get('weekday')];

    let start: Date;
    let end: Date;

    if (range === 'day') {
      start = new Date(Date.UTC(year, month, day));
      end = new Date(Date.UTC(year, month, day + 1));
    } else if (range === 'week') {
      const diffToMonday = weekday === 0 ? 6 : weekday - 1;
      start = new Date(Date.UTC(year, month, day - diffToMonday));
      end = new Date(
        Date.UTC(
          start.getUTCFullYear(),
          start.getUTCMonth(),
          start.getUTCDate() + 7,
        ),
      );
    } else {
      start = new Date(Date.UTC(year, month, 1));
      end = new Date(Date.UTC(year, month + 1, 1));
    }

    const [cashRecords, creditReceipts] = await Promise.all([
      this.paymentRecordsRepository.findInRange(tenantId, start, end),
      // No se usa Installment.paidAt/paidAmount acá: paidAt solo se completa
      // cuando la cuota queda TOTALMENTE pagada (ver applyPaymentToInstallment
      // en loans.service.ts), así que un abono parcial nunca aparecía en
      // "recaudación de hoy" — ni el día del abono ni ningún otro. paidAmount
      // además es el acumulado de la cuota, no lo cobrado en esta operación.
      // PaymentReceipt sí se crea una vez por cada cobro real (parcial o
      // total, ver payInstallment/payByAmount/payInstallments), con
      // totalAmount = lo efectivamente cobrado en esa operación e issuedAt
      // = el instante real del cobro — es la fuente correcta para "cuánto se
      // cobró en este rango".
      this.paymentSources.findReceiptsInRange(tenantId, start, end),
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
    for (const r of creditReceipts) {
      const a = toNum(r.totalAmount);
      creditTotal += a;
      aggCredit[r.paymentMethod] = (aggCredit[r.paymentMethod] ?? 0) + a;
    }

    const byMethod: Record<string, number> = { ...aggCash };
    for (const [m, v] of Object.entries(aggCredit)) {
      byMethod[m] = (byMethod[m] ?? 0) + v;
    }

    return {
      range,
      total: cashTotal + creditTotal,
      cash: { total: cashTotal, byMethod: aggCash },
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
      throw new UnprocessableEntityException(
        'Esta cuenta ya fue pagada en su totalidad',
      );
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

      const updated = await this.arRepository.incrementPaid(
        arId,
        dto.amount,
        tx,
      );
      invoiceId = updated.invoiceId;
      newStatus =
        Number(updated.paidAmount) >= Number(updated.amount) - 0.01
          ? 'PAID'
          : 'PARTIAL';

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
      after: {
        amount: dto.amount,
        method: dto.paymentMethod,
        status: newStatus!,
      },
    } satisfies AuditLogEvent);

    return this.arRepository.findById(tenantId, arId);
  }
}
