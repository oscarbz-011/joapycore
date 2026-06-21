import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AccountsReceivableRepository } from '../repositories/accounts-receivable.repository';
import { PaymentRecordsRepository } from '../repositories/payment-records.repository';
import { RegisterPaymentDto } from '../dto/register-payment.dto';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly arRepository: AccountsReceivableRepository,
    private readonly paymentRecordsRepository: PaymentRecordsRepository,
  ) {}

  findAll(tenantId: string) {
    return this.arRepository.findAll(tenantId);
  }

  async findOne(tenantId: string, id: string) {
    const ar = await this.arRepository.findById(tenantId, id);
    if (!ar) throw new NotFoundException('Cuenta por cobrar no encontrada');
    return ar;
  }

  async registerPayment(tenantId: string, arId: string, dto: RegisterPaymentDto) {
    const ar = await this.findOne(tenantId, arId);

    if (ar.status === 'PAID') {
      throw new UnprocessableEntityException('Esta cuenta ya fue pagada en su totalidad');
    }
    if (ar.status === 'CANCELLED') {
      throw new UnprocessableEntityException('No se puede registrar un pago sobre una cuenta cancelada');
    }

    const currentPaid = Number(ar.paidAmount);
    const remaining = Number(ar.amount) - currentPaid;

    if (dto.amount > remaining + 0.01) {
      throw new UnprocessableEntityException(
        `El monto (${dto.amount}) supera el saldo pendiente (${remaining.toFixed(2)})`,
      );
    }

    await this.paymentRecordsRepository.create({
      tenantId,
      accountsReceivableId: arId,
      amount: dto.amount,
      paymentMethod: dto.paymentMethod,
      paymentDate: new Date(dto.paymentDate),
      reference: dto.reference,
      notes: dto.notes,
    });

    const newPaid = currentPaid + dto.amount;
    const newStatus: 'PARTIAL' | 'PAID' =
      newPaid >= Number(ar.amount) - 0.01 ? 'PAID' : 'PARTIAL';

    await this.arRepository.updateAmounts(arId, newPaid, newStatus);

    return this.arRepository.findById(tenantId, arId);
  }
}
