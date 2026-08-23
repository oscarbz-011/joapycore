import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CombosRepository } from '../repositories/combos.repository';
import { CreateComboDto } from '../dto/create-combo.dto';
import { UpdateComboDto } from '../dto/update-combo.dto';
import type { AuditLogEvent } from '../../../audit/audit-log.event';

@Injectable()
export class CombosService {
  constructor(
    private readonly combosRepository: CombosRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  findAll(tenantId: string, onlyActive = false) {
    return this.combosRepository.findAll(tenantId, onlyActive);
  }

  async findOne(tenantId: string, id: string) {
    const combo = await this.combosRepository.findById(tenantId, id);
    if (!combo) throw new NotFoundException('Combo no encontrado');
    return combo;
  }

  async create(tenantId: string, dto: CreateComboDto, userId?: string) {
    this.validatePriceMode(dto);
    const combo = await this.combosRepository.create(tenantId, dto);
    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'sales',
      action: 'sale_combo.created',
      resourceId: combo.id,
      after: combo,
    } satisfies AuditLogEvent);
    return combo;
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateComboDto,
    userId?: string,
  ) {
    const existing = await this.findOne(tenantId, id);
    this.validatePriceMode({
      priceMode: dto.priceMode ?? existing.priceMode,
      fixedPrice:
        dto.fixedPrice ??
        (existing.fixedPrice != null ? Number(existing.fixedPrice) : undefined),
      discountPercentage:
        dto.discountPercentage ??
        (existing.discountPercentage != null
          ? Number(existing.discountPercentage)
          : undefined),
    });
    const updated = await this.combosRepository.update(tenantId, id, dto);
    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'sales',
      action: 'sale_combo.updated',
      resourceId: id,
      before: existing,
      after: updated,
    } satisfies AuditLogEvent);
    return updated;
  }

  async remove(tenantId: string, id: string, userId?: string) {
    await this.findOne(tenantId, id);
    await this.combosRepository.softDelete(tenantId, id);
    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'sales',
      action: 'sale_combo.deleted',
      resourceId: id,
    } satisfies AuditLogEvent);
  }

  private validatePriceMode(dto: {
    priceMode: string;
    fixedPrice?: number;
    discountPercentage?: number;
  }) {
    if (dto.priceMode === 'FIXED' && !dto.fixedPrice) {
      throw new UnprocessableEntityException(
        'Los combos con precio fijo requieren fixedPrice',
      );
    }
    if (dto.priceMode === 'SUM_WITH_DISCOUNT' && dto.discountPercentage == null) {
      throw new UnprocessableEntityException(
        'Los combos con suma de componentes requieren discountPercentage (puede ser 0)',
      );
    }
  }
}
