import {
  BadRequestException,
  ConflictException,
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
import { ProductSuppliersRepository } from '../repositories/product-suppliers.repository';
import { CreateProductDto } from '../dto/create-product.dto';
import { UpdateProductDto } from '../dto/update-product.dto';
import { AddProductUnitsDto } from '../dto/add-product-units.dto';
import { CreateStockMovementDto } from '../dto/create-stock-movement.dto';
import { CreateProductSupplierDto } from '../dto/create-product-supplier.dto';
import { UpdateProductSupplierDto } from '../dto/update-product-supplier.dto';

@Injectable()
export class ProductsService {
  constructor(
    private readonly productsRepository: ProductsRepository,
    private readonly productUnitsRepository: ProductUnitsRepository,
    private readonly productSuppliersRepository: ProductSuppliersRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  findAll(tenantId: string, filters: ProductFilters) {
    return this.productsRepository.findAll(tenantId, filters);
  }

  findAllWithStock(tenantId: string, filters: ProductFilters) {
    return this.productsRepository.findAllWithStock(tenantId, filters);
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

  async addStockMovement(
    tenantId: string,
    productId: string,
    dto: CreateStockMovementDto,
  ) {
    const product = await this.findOne(tenantId, productId);
    if (product.isSerialized) {
      throw new UnprocessableEntityException(
        'Los productos serializados gestionan el stock a través de unidades con número de serie',
      );
    }
    // OUT movements reduce stock — store as negative quantity
    const effectiveQty =
      dto.type === 'OUT' ? -Math.abs(dto.quantity) : dto.quantity;

    const movement = await this.productsRepository.createStockMovement(
      tenantId,
      productId,
      { type: dto.type, quantity: effectiveQty, notes: dto.notes },
    );
    this.eventEmitter.emit('stock.movement.created', {
      tenantId,
      productId,
      type: dto.type,
      quantity: dto.quantity,
    });
    return movement;
  }

  // ── Suppliers ────────────────────────────────────────────────────────────────

  async getProductSuppliers(tenantId: string, productId: string) {
    await this.findOne(tenantId, productId);
    return this.productSuppliersRepository.findByProduct(tenantId, productId);
  }

  async addProductSupplier(
    tenantId: string,
    productId: string,
    dto: CreateProductSupplierDto,
  ) {
    await this.findOne(tenantId, productId);

    const supplier = await this.productSuppliersRepository.supplierExistsForTenant(
      tenantId,
      dto.supplierId,
    );
    if (!supplier) throw new BadRequestException('Proveedor no encontrado');

    const existing = await this.productSuppliersRepository.findOne(
      tenantId,
      productId,
      dto.supplierId,
    );
    if (existing) throw new ConflictException('El proveedor ya está asociado a este producto');

    if (dto.isPreferred) {
      await this.productSuppliersRepository.clearPreferred(tenantId, productId);
    }

    return this.productSuppliersRepository.create(tenantId, productId, dto.supplierId, {
      costPrice: dto.costPrice,
      isPreferred: dto.isPreferred ?? false,
    });
  }

  async updateProductSupplier(
    tenantId: string,
    productId: string,
    supplierId: string,
    dto: UpdateProductSupplierDto,
  ) {
    await this.findOne(tenantId, productId);
    const link = await this.productSuppliersRepository.findOne(tenantId, productId, supplierId);
    if (!link) throw new NotFoundException('Asociación proveedor-producto no encontrada');

    if (dto.isPreferred) {
      await this.productSuppliersRepository.clearPreferred(tenantId, productId);
    }

    await this.productSuppliersRepository.update(tenantId, productId, supplierId, dto);
    return this.productSuppliersRepository.findOne(tenantId, productId, supplierId);
  }

  async removeProductSupplier(
    tenantId: string,
    productId: string,
    supplierId: string,
  ) {
    await this.findOne(tenantId, productId);
    await this.productSuppliersRepository.delete(tenantId, productId, supplierId);
  }
}
