import { qty } from '../../../common/units/quantity';
import { Injectable } from '@nestjs/common';
import { AlertsService } from '../../alerts/services/alerts.service';
import { FilterStockDto } from '../dto/filter-stock.dto';
import { StockRepository } from '../repositories/stock.repository';
import { StockSourcesRepository } from '../repositories/stock-sources.repository';

export type ReorderPointSource = 'PRODUCT' | 'ALERT';

@Injectable()
export class StockService {
  constructor(
    private readonly stockRepository: StockRepository,
    private readonly alertsService: AlertsService,
    private readonly sources: StockSourcesRepository,
  ) {}

  /**
   * El punto de reposición de cada producto es su propio stock mínimo; si no
   * tiene uno (0), vale el umbral general de la alerta "Stock bajo" mientras
   * esté activa. 0 = sin punto de reposición: solo se marca al quedar en cero.
   */
  async findAll(tenantId: string, filters: FilterStockDto) {
    const [warehouses, alertThreshold] = await Promise.all([
      this.sources.findWarehouses(tenantId),
      this.alertsService.findActiveThreshold(tenantId, 'STOCK_LOW'),
    ]);
    const result = await this.stockRepository.findAll(
      tenantId,
      filters,
      warehouses,
    );
    return {
      ...result,
      items: result.items.map((row) => {
        const own = row.product.stockMin.gt(0);
        const reorderPointSource: ReorderPointSource | null = own
          ? 'PRODUCT'
          : alertThreshold
            ? 'ALERT'
            : null;
        return {
          ...row,
          product: {
            ...row.product,
            reorderPoint: own ? row.product.stockMin : qty(alertThreshold),
            reorderPointSource,
          },
        };
      }),
    };
  }
}
