import { Module } from '@nestjs/common';
import { BatchesController } from './controllers/batches.controller';
import { BrandsController } from './controllers/brands.controller';
import { CategoriesController } from './controllers/categories.controller';
import { MovementsController } from './controllers/movements.controller';
import { ProductsController } from './controllers/products.controller';
import { StockEntryController } from './controllers/stock-entry.controller';
import { StockController } from './controllers/stock.controller';
import { InventoryOnInvoiceListener } from './events/inventory-on-invoice.listener';
import { InventoryOnPurchaseReceiptListener } from './events/inventory-on-purchase-receipt.listener';
import { InventoryOnProductionListener } from './events/inventory-on-production.listener';
import { InventoryOnSaleDeliveredListener } from './events/inventory-on-sale-delivered.listener';
import { InventoryOnTenantListener } from './events/inventory-on-tenant.listener';
import { BrandsRepository } from './repositories/brands.repository';
import { CategoriesRepository } from './repositories/categories.repository';
import { ProductBatchesRepository } from './repositories/product-batches.repository';
import { ProductUnitsRepository } from './repositories/product-units.repository';
import { ProductsRepository } from './repositories/products.repository';
import { ProductSuppliersRepository } from './repositories/product-suppliers.repository';
import { StockMovementsRepository } from './repositories/stock-movements.repository';
import { StockRepository } from './repositories/stock.repository';
import { StockSourcesRepository } from './repositories/stock-sources.repository';
import { BrandsService } from './services/brands.service';
import { CategoriesService } from './services/categories.service';
import { ProductsService } from './services/products.service';
import { StockEntryService } from './services/stock-entry.service';
import { StockService } from './services/stock.service';
import { UnlocatedStockService } from './services/unlocated-stock.service';
import { WarehousesModule } from '../warehouses/warehouses.module';
import { AlertsModule } from '../alerts/alerts.module';

@Module({
  imports: [WarehousesModule, AlertsModule],
  controllers: [
    BrandsController,
    CategoriesController,
    MovementsController,
    ProductsController,
    BatchesController,
    StockEntryController,
    StockController,
  ],
  providers: [
    BrandsService,
    CategoriesService,
    ProductsService,
    StockEntryService,
    StockService,
    UnlocatedStockService,
    BrandsRepository,
    CategoriesRepository,
    ProductsRepository,
    ProductUnitsRepository,
    ProductSuppliersRepository,
    ProductBatchesRepository,
    StockMovementsRepository,
    StockRepository,
    StockSourcesRepository,
    InventoryOnTenantListener,
    InventoryOnInvoiceListener,
    InventoryOnPurchaseReceiptListener,
    InventoryOnProductionListener,
    InventoryOnSaleDeliveredListener,
  ],
  exports: [ProductsRepository, ProductUnitsRepository, CategoriesRepository],
})
export class InventoryModule {}
