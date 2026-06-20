import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ProductsRepository,
  ProductFilters,
} from '../repositories/products.repository';
import { ProductUnitsRepository } from '../repositories/product-units.repository';
import { CreateProductDto } from '../dto/create-product.dto';
import { UpdateProductDto } from '../dto/update-product.dto';
import { AddProductUnitsDto } from '../dto/add-product-units.dto';

@Injectable()
export class ProductsService {
  constructor(
    private readonly productsRepository: ProductsRepository,
    private readonly productUnitsRepository: ProductUnitsRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  findAll(tenantId: string, filters: ProductFilters) {
    return this.productsRepository.findAll(tenantId, filters);
  }

  async findOne(tenantId: string, id: string) {
    const product = await this.productsRepository.findById(tenantId, id);
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async findOneWithStock(tenantId: string, id: string) {
    const product = await this.findOne(tenantId, id);
    const stock = product.isSerialized
      ? await this.productsRepository.getSerializedStock(tenantId, id)
      : await this.productsRepository.getStock(tenantId, id);
    return { ...product, stock };
  }

  async create(tenantId: string, dto: CreateProductDto) {
    return this.productsRepository.create(tenantId, {
      categoryId: dto.categoryId,
      brandId: dto.brandId,
      model: dto.model,
      name: dto.name,
      description: dto.description,
      isSerialized: dto.isSerialized,
      unit: dto.unit ?? 'unidad',
      costPrice: dto.costPrice,
      salePrice: dto.salePrice,
    });
  }

  async update(tenantId: string, id: string, dto: UpdateProductDto) {
    await this.findOne(tenantId, id);
    await this.productsRepository.update(tenantId, id, dto);
    return this.productsRepository.findById(tenantId, id);
  }

  async delete(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    await this.productsRepository.softDelete(tenantId, id);
  }

  async addUnits(tenantId: string, productId: string, dto: AddProductUnitsDto) {
    const product = await this.findOne(tenantId, productId);
    if (!product.isSerialized) {
      throw new UnprocessableEntityException('Product is not serialized');
    }
    const result = await this.productUnitsRepository.createMany(
      tenantId,
      productId,
      dto.serialNumbers,
    );
    this.eventEmitter.emit('stock.movement.created', {
      tenantId,
      productId,
      type: 'IN',
      quantity: result.count,
    });
    return { created: result.count };
  }

  findUnits(tenantId: string, productId: string) {
    return this.productUnitsRepository.findByProduct(tenantId, productId);
  }
}
