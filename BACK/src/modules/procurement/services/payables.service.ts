import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../prisma/prisma.service';
import { AccountsPayableRepository } from '../repositories/accounts-payable.repository';
import { SupplierPaymentsRepository } from '../repositories/supplier-payments.repository';
import { RegisterSupplierPaymentDto } from '../dto/register-supplier-payment.dto';
import type { AuditLogEvent } from '../../../audit/audit-log.event';

@Injectable()
export class PayablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly apRepository: AccountsPayableRepository,
    private readonly supplierPaymentsRepository: SupplierPaymentsRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  findAll(tenantId: string) {
    return this.apRepository.findAll(tenantId);
  }

  async findOne(tenantId: string, id: string) {
    const ap = await this.apRepository.findById(tenantId, id);
    if (!ap) throw new NotFoundException('Cuenta por pagar no encontrada');
    return ap;
  }

  async registerPayment(
    tenantId: string,
    apId: string,
    dto: RegisterSupplierPaymentDto,
    userId?: string,
  ) {
    const ap = await this.findOne(tenantId, apId);

    if (ap.status === 'PAID') {
      throw new UnprocessableEntityException(
        'Esta cuenta ya fue pagada en su totalidad',
      );
    }
    if (ap.status === 'CANCELLED') {
      throw new UnprocessableEntityException(
        'No se puede registrar un pago sobre una cuenta cancelada',
      );
    }

    const remaining = Number(ap.amount) - Number(ap.paidAmount);
    if (dto.amount > remaining + 0.01) {
      throw new UnprocessableEntityException(
        `El monto (${dto.amount}) supera el saldo pendiente (${remaining.toFixed(2)})`,
      );
    }

    // Misma transacción atómica que PaymentsService.registerPayment: crea el
    // SupplierPayment e incrementa paidAmount vía `increment` (no
    // leer-modificar-escribir) para evitar condiciones de carrera entre
    // pagos simultáneos sobre la misma cuenta.
    let newStatus: 'PARTIAL' | 'PAID';
    let purchaseReceiptId: string;

    await this.prisma.$transaction(async (tx) => {
      await this.supplierPaymentsRepository.create(
        {
          tenantId,
          accountsPayableId: apId,
          amount: dto.amount,
          paymentMethod: dto.paymentMethod,
          paymentDate: new Date(dto.paymentDate),
          reference: dto.reference,
          notes: dto.notes,
          createdById: userId,
        },
        tx,
      );

      const updated = await this.apRepository.incrementPaid(
        apId,
        dto.amount,
        tx,
      );
      purchaseReceiptId = updated.purchaseReceiptId;
      newStatus =
        Number(updated.paidAmount) >= Number(updated.amount) - 0.01
          ? 'PAID'
          : 'PARTIAL';

      await this.apRepository.updateStatus(apId, newStatus, tx);
    });

    // Emitir después de que la transacción confirma — mismo criterio que payments.
    if (newStatus! === 'PAID') {
      this.eventEmitter.emit('payment.ap.completed', {
        tenantId,
        apId,
        purchaseReceiptId: purchaseReceiptId!,
      });
    }

    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'procurement',
      action: 'payment.ap.registered',
      resourceId: apId,
      after: {
        amount: dto.amount,
        method: dto.paymentMethod,
        status: newStatus!,
      },
    } satisfies AuditLogEvent);

    return this.apRepository.findById(tenantId, apId);
  }
}
