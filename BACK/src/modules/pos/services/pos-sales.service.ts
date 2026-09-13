import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SaleOrdersService } from '../../sales/services/sale-orders.service';
import { CreatePosSaleDto } from '../dto/create-pos-sale.dto';
import {
  PosSalesHistoryFilters,
  PosSalesRepository,
} from '../repositories/pos-sales.repository';
import { PosSessionsRepository } from '../repositories/pos-sessions.repository';

@Injectable()
export class PosSalesService {
  constructor(
    private readonly saleOrdersService: SaleOrdersService,
    private readonly posSessionsRepository: PosSessionsRepository,
    private readonly posSalesRepository: PosSalesRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(tenantId: string, dto: CreatePosSaleDto, cashierId: string) {
    const session = await this.posSessionsRepository.findActiveByCashier(
      tenantId,
      cashierId,
    );
    if (!session) {
      throw new UnprocessableEntityException(
        'No tenés una sesión de caja abierta. Abrí la caja antes de vender.',
      );
    }

    const order = await this.saleOrdersService.createPosSale(
      tenantId,
      dto,
      session.id,
      cashierId,
    );

    this.eventEmitter.emit('pos.sale.created', {
      tenantId,
      saleOrderId: order.id,
      posSessionId: session.id,
    });

    return order;
  }

  listBySession(tenantId: string, sessionId: string) {
    return this.posSalesRepository.findBySession(tenantId, sessionId);
  }

  listHistory(tenantId: string, filters: PosSalesHistoryFilters) {
    return this.posSalesRepository.findHistory(tenantId, filters);
  }
}
