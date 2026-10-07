import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { AuditLogEvent } from '../../../audit/audit-log.event';
import { PrismaService } from '../../../prisma/prisma.service';
import type { PrismaClientOrTx } from '../../../prisma/types';
import { advanceBalance } from '../advance.util';
import { RegisterSupplierPaymentDto } from '../dto/register-supplier-payment.dto';
import { PurchaseOrdersRepository } from '../repositories/purchase-orders.repository';
import { SupplierPaymentsRepository } from '../repositories/supplier-payments.repository';

const CENT = 0.01;
const gs = (n: number) => `Gs. ${Math.round(n).toLocaleString('es-PY')}`;

/**
 * Anticipos de una orden de compra: lo que se le paga al proveedor antes de
 * recibir la mercadería, y su devolución. El saldo se descuenta solo de las
 * cuentas por pagar de la orden al recibir (ver ProcurementOnReceiptListener).
 */
@Injectable()
export class PurchaseOrderAdvancesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: PurchaseOrdersRepository,
    private readonly supplierPayments: SupplierPaymentsRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async balance(tenantId: string, orderId: string, client?: PrismaClientOrTx) {
    const { balance } = await this.load(tenantId, orderId, client);
    return balance;
  }

  /** Cambia cuánto anticipo pide esta orden (0 = ninguno, hasta el total). */
  async setRequired(
    tenantId: string,
    orderId: string,
    amount: number,
    userId?: string,
  ) {
    const { order, balance } = await this.load(tenantId, orderId);
    this.assertOpen(order.status);
    if (amount < 0 || amount > balance.orderTotal + CENT) {
      throw new UnprocessableEntityException(
        `El anticipo tiene que estar entre 0 y el total de la orden (${gs(balance.orderTotal)})`,
      );
    }
    await this.orders.setAdvanceAmount(tenantId, orderId, amount);
    this.audit(tenantId, userId, orderId, 'purchase.order.advance.required', {
      before: balance.required,
      amount,
    });
    return this.balance(tenantId, orderId);
  }

  async registerPayment(
    tenantId: string,
    orderId: string,
    dto: RegisterSupplierPaymentDto,
    userId?: string,
  ) {
    return this.record(tenantId, orderId, dto, userId, 'ADVANCE');
  }

  async registerRefund(
    tenantId: string,
    orderId: string,
    dto: RegisterSupplierPaymentDto,
    userId?: string,
  ) {
    return this.record(tenantId, orderId, dto, userId, 'ADVANCE_REFUND');
  }

  private async record(
    tenantId: string,
    orderId: string,
    dto: RegisterSupplierPaymentDto,
    userId: string | undefined,
    kind: 'ADVANCE' | 'ADVANCE_REFUND',
  ) {
    await this.prisma.$transaction(async (tx) => {
      // Dos pagos a la vez leerían el mismo saldo: se bloquea la orden y el
      // saldo se calcula ya dentro de la transacción.
      await this.orders.lockForAdvance(tenantId, orderId, tx);
      const { order, balance } = await this.load(tenantId, orderId, tx);

      if (kind === 'ADVANCE') {
        this.assertOpen(order.status);
        const net = balance.paid - balance.refunded;
        if (net + dto.amount > balance.orderTotal + CENT) {
          throw new UnprocessableEntityException(
            `El anticipo no puede superar el total de la orden: quedan ${gs(balance.orderTotal - net)} por adelantar`,
          );
        }
      } else if (dto.amount > balance.available + CENT) {
        throw new UnprocessableEntityException(
          `La devolución supera el saldo a favor con el proveedor (${gs(balance.available)})`,
        );
      }

      await this.supplierPayments.create(
        {
          tenantId,
          purchaseOrderId: orderId,
          kind,
          amount: dto.amount,
          paymentMethod: dto.paymentMethod,
          paymentDate: new Date(dto.paymentDate),
          reference: dto.reference,
          notes: dto.notes,
          createdById: userId,
        },
        tx,
      );
    });

    this.audit(
      tenantId,
      userId,
      orderId,
      kind === 'ADVANCE'
        ? 'purchase.order.advance.paid'
        : 'purchase.order.advance.refunded',
      { amount: dto.amount, method: dto.paymentMethod },
    );
    return this.balance(tenantId, orderId);
  }

  private async load(
    tenantId: string,
    orderId: string,
    client?: PrismaClientOrTx,
  ) {
    const order = await this.orders.findForAdvance(tenantId, orderId, client);
    if (!order) throw new NotFoundException('Purchase order not found');

    const [payments, applied] = await Promise.all([
      this.orders.advanceMovements(tenantId, orderId, client),
      this.orders.advanceApplied(tenantId, orderId, client),
    ]);
    const orderTotal = order.items.reduce(
      (sum, item) => sum + item.quantity * Number(item.unitCost),
      0,
    );
    return {
      order,
      balance: {
        orderTotal,
        ...advanceBalance({ required: order.advanceAmount, payments, applied }),
      },
    };
  }

  // Cancelada: no se le adelanta nada. Recibida: ya no hay nada que adelantar,
  // lo que queda se paga por su cuenta por pagar.
  private assertOpen(status: string) {
    if (status === 'CANCELLED' || status === 'RECEIVED') {
      throw new UnprocessableEntityException(
        status === 'CANCELLED'
          ? 'La orden está cancelada'
          : 'La orden ya se recibió completa: lo pendiente se paga desde Cuentas por pagar',
      );
    }
  }

  private audit(
    tenantId: string,
    userId: string | undefined,
    orderId: string,
    action: string,
    after: Record<string, unknown>,
  ) {
    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'procurement',
      action,
      resourceId: orderId,
      after,
    } satisfies AuditLogEvent);
  }
}
