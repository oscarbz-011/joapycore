import { Global, Module } from '@nestjs/common';
import { PRODUCT_CATALOG } from '../../common/contracts/product-catalog.contract';
import { STOCK_LEDGER } from '../../common/contracts/stock-ledger.contract';
import { STOCK_REPORT_SOURCE } from '../../common/contracts/report-sources.contract';
import { TenantsModule } from '../../tenants/tenants.module';
import { StockReportRepository } from './repositories/stock-report.repository';
import { StockReportSourceService } from './services/stock-report-source.service';
import { ProductUnitsRepository } from './repositories/product-units.repository';
import { ProductsRepository } from './repositories/products.repository';
import { StockMovementsRepository } from './repositories/stock-movements.repository';
import { StockLedgerService } from './services/stock-ledger.service';
import { StockSourcesRepository } from './repositories/stock-sources.repository';

/**
 * Lo que Inventario ofrece a otros módulos, por contrato. Es global para que
 * Ventas/POS inyecten los tokens sin importar InventoryModule (las reglas de
 * CLAUDE.md prohíben imports entre módulos de negocio).
 */
@Global()
@Module({
  imports: [TenantsModule],
  providers: [
    ProductsRepository,
    ProductUnitsRepository,
    StockMovementsRepository,
    StockSourcesRepository,
    StockLedgerService,
    { provide: PRODUCT_CATALOG, useExisting: ProductsRepository },
    StockReportRepository,
    StockReportSourceService,
    { provide: STOCK_LEDGER, useExisting: StockLedgerService },
    { provide: STOCK_REPORT_SOURCE, useExisting: StockReportSourceService },
  ],
  exports: [PRODUCT_CATALOG, STOCK_LEDGER, STOCK_REPORT_SOURCE],
})
export class InventoryContractsModule {}
