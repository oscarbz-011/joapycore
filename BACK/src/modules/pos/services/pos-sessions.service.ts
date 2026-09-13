import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PosSessionStatus } from '@prisma/client';
import type { AuditLogEvent } from '../../../audit/audit-log.event';
import { ClosePosSessionDto } from '../dto/close-pos-session.dto';
import { OpenPosSessionDto } from '../dto/open-pos-session.dto';
import { PosSessionsRepository } from '../repositories/pos-sessions.repository';
import { PosTerminalsService } from './pos-terminals.service';

function toNum(value: unknown): number {
  if (typeof value === 'object' && value !== null && 'toNumber' in value) {
    return (value as { toNumber(): number }).toNumber();
  }
  return Number(value ?? 0);
}

@Injectable()
export class PosSessionsService {
  constructor(
    private readonly posSessionsRepository: PosSessionsRepository,
    private readonly posTerminalsService: PosTerminalsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async open(tenantId: string, dto: OpenPosSessionDto, cashierId: string) {
    // 404s if the terminal doesn't belong to this tenant
    await this.posTerminalsService.findOne(tenantId, dto.terminalId);

    const existing = await this.posSessionsRepository.findActiveByTerminal(
      tenantId,
      dto.terminalId,
    );
    if (existing) {
      throw new UnprocessableEntityException(
        'Esta caja ya tiene una sesión abierta',
      );
    }

    const session = await this.posSessionsRepository.create(tenantId, {
      terminalId: dto.terminalId,
      cashierId,
      openingCash: dto.openingCash,
    });

    this.eventEmitter.emit('pos.session.opened', {
      tenantId,
      sessionId: session.id,
      terminalId: dto.terminalId,
      cashierId,
      openingCash: dto.openingCash,
    });
    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId: cashierId,
      module: 'pos',
      action: 'pos.session.opened',
      resourceId: session.id,
    } satisfies AuditLogEvent);

    return session;
  }

  getActive(tenantId: string, cashierId: string) {
    return this.posSessionsRepository.findActiveByCashier(tenantId, cashierId);
  }

  async findOne(tenantId: string, id: string) {
    const session = await this.posSessionsRepository.findById(tenantId, id);
    if (!session) throw new NotFoundException('Sesión de caja no encontrada');
    return session;
  }

  findAll(
    tenantId: string,
    filters: { terminalId?: string; status?: PosSessionStatus } = {},
  ) {
    return this.posSessionsRepository.findAll(tenantId, filters);
  }

  async close(
    tenantId: string,
    id: string,
    dto: ClosePosSessionDto,
    userId: string,
  ) {
    const session = await this.findOne(tenantId, id);
    if (session.status !== 'OPEN') {
      throw new UnprocessableEntityException('Esta sesión ya está cerrada');
    }

    const cashSum = await this.posSessionsRepository.sumCashPayments(
      tenantId,
      id,
    );
    const expectedCash =
      toNum(session.openingCash) + toNum(cashSum._sum.amount);
    const difference = Math.round((dto.closingCash - expectedCash) * 100) / 100;
    const status = difference === 0 ? 'CLOSED' : 'DISCREPANCY';

    const closed = await this.posSessionsRepository.close(id, {
      closingCash: dto.closingCash,
      expectedCash,
      difference,
      status,
      notes: dto.notes,
    });

    this.eventEmitter.emit('pos.session.closed', {
      tenantId,
      sessionId: id,
      expectedCash,
      closingCash: dto.closingCash,
      difference,
      status,
    });
    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'pos',
      action: 'pos.session.closed',
      resourceId: id,
      after: { expectedCash, closingCash: dto.closingCash, difference, status },
    } satisfies AuditLogEvent);

    return closed;
  }
}
