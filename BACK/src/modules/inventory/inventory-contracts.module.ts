import { Global, Module } from '@nestjs/common';
import { PRODUCT_CATALOG } from '../../common/contracts/product-catalog.contract';
import { STOCK_LEDGER } from '../../common/contracts/stock-ledger.contract';
import { ProductUnitsRepository } from './repositories/product-units.repository';
import { ProductsRepository } from './repositories/products.repository';
import { StockMovementsRepository } from './repositories/stock-movements.repository';
import { StockLedgerService } from './services/stock-ledger.service';

/**
 * Lo que Inventario ofrece a otros módulos, por contrato. Es global para que
 * Ventas/POS inyecten los tokens sin importar InventoryModule (las reglas de
 * CLAUDE.md prohíben imports entre módulos de negocio).
 */
@Global()
@Module({
  providers: [
    ProductsRepository,
    ProductUnitsRepository,
    StockMovementsRepository,
    StockLedgerService,
    { provide: PRODUCT_CATALOG, useExisting: ProductsRepository },
    { provide: STOCK_LEDGER, useExisting: StockLedgerService },
  ],
  exports: [PRODUCT_CATALOG, STOCK_LEDGER],
})
export class InventoryContractsModule {}
