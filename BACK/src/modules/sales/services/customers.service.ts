import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CustomersRepository } from '../repositories/customers.repository';
import { CreateCustomerDto } from '../dto/create-customer.dto';
import { toTitleCase } from '../../../common/utils/normalize.util';
import type { AuditLogEvent } from '../../../audit/audit-log.event';

@Injectable()
export class CustomersService {
  constructor(
    private readonly customersRepository: CustomersRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  findAll(tenantId: string) {
    return this.customersRepository.findAll(tenantId);
  }

  async findOne(tenantId: string, id: string) {
    const customer = await this.customersRepository.findById(tenantId, id);
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  async create(tenantId: string, dto: CreateCustomerDto, userId?: string) {
    await this.assertDocumentAvailable(
      tenantId,
      dto.documentType ?? null,
      dto.documentNumber,
    );
    if (dto.email) {
      const existing = await this.customersRepository.findByEmail(
        tenantId,
        dto.email,
      );
      if (existing)
        throw new ConflictException('Ya existe un cliente con ese email');
    }
    const customerCode = await this.generateCustomerCode(tenantId);
    const customer = await this.customersRepository.create(tenantId, {
      ...dto,
      firstName: toTitleCase(dto.firstName),
      lastName: toTitleCase(dto.lastName),
      customerCode,
    });

    // Sin listeners de negocio propios hoy — existe para que el bridge de
    // WebSocket (WsBridgeListener, escucha *todo* evento) empuje la
    // actualización a los clientes conectados sin que cada pantalla tenga
    // que refrescar sola. Ver front/lib/ws-event-map.ts.
    this.eventEmitter.emit('customer.created', {
      tenantId,
      customerId: customer.id,
    });
    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'sales',
      action: 'customer.created',
      resourceId: customer.id,
      after: customer,
    } satisfies AuditLogEvent);

    return customer;
  }

  async update(
    tenantId: string,
    id: string,
    dto: Partial<CreateCustomerDto>,
    userId?: string,
  ) {
    const before = await this.findOne(tenantId, id);
    if (dto.documentNumber !== undefined || dto.documentType !== undefined) {
      await this.assertDocumentAvailable(
        tenantId,
        dto.documentType ?? before.documentType ?? null,
        dto.documentNumber ?? before.documentNumber,
        id,
      );
    }
    if (dto.email) {
      const existing = await this.customersRepository.findByEmail(
        tenantId,
        dto.email,
        id,
      );
      if (existing)
        throw new ConflictException('Ya existe un cliente con ese email');
    }
    const customer = await this.customersRepository.update(tenantId, id, {
      ...dto,
      ...(dto.firstName ? { firstName: toTitleCase(dto.firstName) } : {}),
      ...(dto.lastName ? { lastName: toTitleCase(dto.lastName) } : {}),
    });

    this.eventEmitter.emit('customer.updated', { tenantId, customerId: id });
    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'sales',
      action: 'customer.updated',
      resourceId: id,
      before,
      after: customer,
    } satisfies AuditLogEvent);

    return customer;
  }

  // Calificación 6: el cliente no puede recibir un crédito nuevo hasta que
  // se le quite la marca. Ver CreditEvaluationService.
  async markUncollectible(
    tenantId: string,
    id: string,
    reason: string,
    userId?: string,
  ) {
    await this.findOne(tenantId, id);
    const mark = {
      uncollectibleAt: new Date(),
      uncollectibleReason: reason.trim(),
    };
    await this.customersRepository.setUncollectible(tenantId, id, mark);
    this.emitUncollectibleChange(tenantId, id, userId, 'marked', mark);
    return this.findOne(tenantId, id);
  }

  async clearUncollectible(tenantId: string, id: string, userId?: string) {
    const before = await this.findOne(tenantId, id);
    await this.customersRepository.setUncollectible(tenantId, id, {
      uncollectibleAt: null,
      uncollectibleReason: null,
    });
    this.emitUncollectibleChange(tenantId, id, userId, 'cleared', {
      uncollectibleAt: before.uncollectibleAt,
      uncollectibleReason: before.uncollectibleReason,
    });
    return this.findOne(tenantId, id);
  }

  private emitUncollectibleChange(
    tenantId: string,
    customerId: string,
    userId: string | undefined,
    change: 'marked' | 'cleared',
    mark: { uncollectibleAt: Date | null; uncollectibleReason: string | null },
  ) {
    this.eventEmitter.emit('customer.updated', { tenantId, customerId });
    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'sales',
      action: `customer.uncollectible.${change}`,
      resourceId: customerId,
      ...(change === 'marked' ? { after: mark } : { before: mark }),
    } satisfies AuditLogEvent);
  }

  async delete(tenantId: string, id: string, userId?: string) {
    await this.findOne(tenantId, id);
    const customer = await this.customersRepository.softDelete(tenantId, id);

    this.eventEmitter.emit('customer.deleted', { tenantId, customerId: id });
    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'sales',
      action: 'customer.deleted',
      resourceId: id,
    } satisfies AuditLogEvent);

    return customer;
  }

  // El mismo documento no puede identificar a dos clientes activos: se
  // duplicaban historiales de crédito y cuentas por cobrar de una misma
  // persona. No es un índice único en la base porque ya existen duplicados
  // que hay que resolver a mano.
  private async assertDocumentAvailable(
    tenantId: string,
    documentType: CreateCustomerDto['documentType'] | null,
    documentNumber: string | null | undefined,
    excludeId?: string,
  ) {
    const number = documentNumber?.trim();
    if (!number) return;
    const existing = await this.customersRepository.findByDocument(
      tenantId,
      documentType ?? null,
      number,
      excludeId,
    );
    if (existing) {
      throw new ConflictException(
        `Ya existe un cliente con ese documento${existing.customerCode ? ` (${existing.customerCode})` : ''}`,
      );
    }
  }

  private async generateCustomerCode(tenantId: string): Promise<string> {
    const year = String(new Date().getFullYear()).slice(-2);
    const last = await this.customersRepository.findLastCode(tenantId);
    if (!last?.customerCode) return `CLI-${year}-000001`;
    const match = last.customerCode.match(/^CLI-\d{2}-(\d+)$/);
    if (!match) return `CLI-${year}-000001`;
    const next = parseInt(match[1], 10) + 1;
    return `CLI-${year}-${String(next).padStart(6, '0')}`;
  }
}
