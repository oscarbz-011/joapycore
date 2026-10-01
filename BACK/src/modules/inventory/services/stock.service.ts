import { Injectable } from '@nestjs/common';
import { FilterStockDto } from '../dto/filter-stock.dto';
import { StockRepository } from '../repositories/stock.repository';

@Injectable()
export class StockService {
  constructor(private readonly stockRepository: StockRepository) {}

  findAll(tenantId: string, filters: FilterStockDto) {
    return this.stockRepository.findAll(tenantId, filters);
  }
}
