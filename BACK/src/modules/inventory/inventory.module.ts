import { Module } from '@nestjs/common';
import { BatchesController } from './controllers/batches.controller';
import { BrandsController } from './controllers/brands.controller';
import { CategoriesController } from './controllers/categories.controller';
import { MovementsController } from './controllers/movements.controller';
import { ProductsController } from './controllers/products.controller';
import { StockEntryController } from './controllers/stock-entry.controller';
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
import { BrandsService } from './services/brands.service';
import { CategoriesService } from './services/categories.service';
import { ProductsService } from './services/products.service';
import { StockEntryService } from './services/stock-entry.service';

@Module({
  controllers: [
    BrandsController,
    CategoriesController,
    MovementsController,
    ProductsController,
    BatchesController,
    StockEntryController,
  ],
  providers: [
    BrandsService,
    CategoriesService,
    ProductsService,
    StockEntryService,
    BrandsRepository,
    CategoriesRepository,
    ProductsRepository,
    ProductUnitsRepository,
    ProductSuppliersRepository,
    ProductBatchesRepository,
    InventoryOnTenantListener,
    InventoryOnInvoiceListener,
    InventoryOnPurchaseReceiptListener,
    InventoryOnProductionListener,
    InventoryOnSaleDeliveredListener,
  ],
  exports: [ProductsRepository, ProductUnitsRepository, CategoriesRepository],
})
export class InventoryModule {}
