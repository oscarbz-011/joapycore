import {
  Inject,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  SALES_GATEWAY,
  type SalesGateway,
} from '../../../common/contracts/sales-gateway.contract';
import { CreatePosSaleDto } from '../dto/create-pos-sale.dto';
import {
  PosSalesHistoryFilters,
  PosSalesRepository,
} from '../repositories/pos-sales.repository';
import { PosSessionsRepository } from '../repositories/pos-sessions.repository';

@Injectable()
export class PosSalesService {
  constructor(
    @Inject(SALES_GATEWAY) private readonly salesGateway: SalesGateway,
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

    const order = await this.salesGateway.createPosSale(
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
