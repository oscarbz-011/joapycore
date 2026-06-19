import { Module } from '@nestjs/common';
import { BrandsController } from './controllers/brands.controller';
import { CategoriesController } from './controllers/categories.controller';
import { ProductsController } from './controllers/products.controller';
import { InventoryOnTenantListener } from './events/inventory-on-tenant.listener';
import { BrandsRepository } from './repositories/brands.repository';
import { CategoriesRepository } from './repositories/categories.repository';
import { ProductUnitsRepository } from './repositories/product-units.repository';
import { ProductsRepository } from './repositories/products.repository';
import { BrandsService } from './services/brands.service';
import { CategoriesService } from './services/categories.service';
import { ProductsService } from './services/products.service';

@Module({
  controllers: [BrandsController, CategoriesController, ProductsController],
  providers: [
    BrandsService,
    CategoriesService,
    ProductsService,
    BrandsRepository,
    CategoriesRepository,
    ProductsRepository,
    ProductUnitsRepository,
    InventoryOnTenantListener,
  ],
  exports: [ProductsRepository, ProductUnitsRepository, CategoriesRepository],
})
export class InventoryModule {}
