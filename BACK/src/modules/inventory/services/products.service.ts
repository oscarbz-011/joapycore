import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  MovementReason,
  ProductStatus,
  StockMovementType,
} from '@prisma/client';
import {
  KIND_DEFAULT_FLAGS,
  defaultKindForIndustry,
  defaultSalesChannelsForKind,
} from '../constants/product-kind.constant';
import {
  ProductsRepository,
  ProductFilters,
} from '../repositories/products.repository';
import { ProductUnitsRepository } from '../repositories/product-units.repository';
import { ProductSuppliersRepository } from '../repositories/product-suppliers.repository';
import { ProductBatchesRepository } from '../repositories/product-batches.repository';
import { CreateProductDto } from '../dto/create-product.dto';
import { UpdateProductDto } from '../dto/update-product.dto';
import { AddProductUnitsDto } from '../dto/add-product-units.dto';
import {
  CreateStockMovementDto,
  CreateGlobalStockMovementDto,
} from '../dto/create-stock-movement.dto';
import { FilterStockMovementDto } from '../dto/filter-stock-movement.dto';
import { CreateProductSupplierDto } from '../dto/create-product-supplier.dto';
import { UpdateProductSupplierDto } from '../dto/update-product-supplier.dto';

@Injectable()
export class ProductsService {
  constructor(
    private readonly productsRepository: ProductsRepository,
    private readonly productUnitsRepository: ProductUnitsRepository,
    private readonly productSuppliersRepository: ProductSuppliersRepository,
    private readonly productBatchesRepository: ProductBatchesRepository,
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

  // Requisitos para que una ficha pueda pasar a ACTIVE (= operar: vender,
  // comprar, facturar). Devuelve la lista de lo que falta, en vez de tirar
  // en el primer faltante, para que el frontend pueda mostrar el checklist
  // completo de una sola vez. No se exige proveedor asociado todavía: el
  // ABM de ProductSupplier existe en la API pero no tiene UI, así que
  // hacerlo obligatorio bloquearía la activación sin forma de resolverlo
  // desde la pantalla — cuando esa UI exista, se agrega acá.
  static missingToActivate(product: {
    costPrice: unknown;
    salePrice: unknown;
    categoryId: string | null;
    unit: string | null;
  }): string[] {
    const missing: string[] = [];
    const num = (v: unknown): number | null =>
      v === null || v === undefined
        ? null
        : typeof v === 'object' && 'toNumber' in v
          ? (v as { toNumber(): number }).toNumber()
          : Number(v);

    const cost = num(product.costPrice);
    const sale = num(product.salePrice);
    if (cost === null || cost <= 0) missing.push('precio de costo');
    if (sale === null || sale <= 0) missing.push('precio de venta');
    if (!product.categoryId) missing.push('categoría');
    if (!product.unit) missing.push('unidad de medida');
    return missing;
  }

  async create(tenantId: string, dto: CreateProductDto) {
    // El estado no se pide al crear: se deriva de si la ficha vino completa.
    // Cargar un producto a medias es válido (queda DRAFT) — lo que no es
    // válido es que opere sin estar completo.
    const missing = ProductsService.missingToActivate({
      costPrice: dto.costPrice,
      salePrice: dto.salePrice,
      categoryId: dto.categoryId ?? null,
      unit: dto.unit ?? 'unidad',
    });

    // El tipo se pide solo si el caller lo manda; si no, lo define el rubro
    // del tenant (una carpintería fabrica lo que vende, una ferretería
    // revende). Los defaults de flujo salen del tipo salvo que vengan explícitos.
    const kind =
      dto.kind ??
      defaultKindForIndustry(
        await this.productsRepository.findTenantIndustry(tenantId),
      );
    const flags = KIND_DEFAULT_FLAGS[kind];

    return this.productsRepository.create(tenantId, {
      kind,
      isPurchasable: dto.isPurchasable ?? flags.isPurchasable,
      salesChannels: dto.salesChannels ?? defaultSalesChannelsForKind(kind),
      categoryId: dto.categoryId,
      brandId: dto.brandId,
      model: dto.model,
      name: dto.name,
      description: dto.description,
      isSerialized: dto.isSerialized,
      usesLots: dto.usesLots ?? false,
      unit: dto.unit ?? 'unidad',
      costPrice: dto.costPrice,
      salePrice: dto.salePrice,
      status: missing.length ? ProductStatus.DRAFT : ProductStatus.ACTIVE,
    });
  }

  async update(tenantId: string, id: string, dto: UpdateProductDto) {
    const current = await this.findOne(tenantId, id);

    // Pasar a ACTIVE valida contra el estado RESULTANTE (lo ya guardado +
    // lo que trae este update), no contra lo guardado antes — si no,
    // completar los precios y activar en un mismo request fallaría.
    if (dto.status === ProductStatus.ACTIVE) {
      const missing = ProductsService.missingToActivate({
        costPrice: dto.costPrice ?? current.costPrice,
        salePrice: dto.salePrice ?? current.salePrice,
        categoryId: dto.categoryId ?? current.categoryId,
        unit: dto.unit ?? current.unit,
      });
      if (missing.length) {
        throw new UnprocessableEntityException(
          `No se puede activar el producto, falta: ${missing.join(', ')}`,
        );
      }
    }

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

  listProductBatches(tenantId: string, productId: string) {
    return this.productBatchesRepository.findByProduct(tenantId, productId);
  }

  listAllBatches(tenantId: string, filters: { productId?: string } = {}) {
    return this.productBatchesRepository.findAll(tenantId, filters);
  }

  listMovements(tenantId: string, filters: FilterStockMovementDto) {
    return this.productsRepository.findMovements(tenantId, filters);
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

    if (dto.reason === MovementReason.TRANSFER) {
      if (!dto.toWarehouseId) {
        throw new BadRequestException(
          'Se requiere el depósito de destino para transferencias',
        );
      }
      const movements = await this.productsRepository.createTransferMovements(
        tenantId,
        productId,
        {
          quantity: dto.quantity,
          fromWarehouseId: dto.warehouseId,
          toWarehouseId: dto.toWarehouseId,
          notes: dto.notes,
        },
      );
      this.eventEmitter.emit('stock.movement.created', {
        tenantId,
        productId,
        type: 'TRANSFER',
        quantity: dto.quantity,
      });
      return movements;
    }

    if (dto.reason === MovementReason.ADJUSTMENT && !dto.direction) {
      throw new BadRequestException(
        'Se requiere la dirección (IN/OUT) para ajustes de inventario',
      );
    }

    let movementType: StockMovementType;
    let effectiveQty: number;

    if (dto.reason === MovementReason.ADJUSTMENT) {
      movementType = StockMovementType.ADJUSTMENT;
      effectiveQty =
        dto.direction === 'OUT'
          ? -Math.abs(dto.quantity)
          : Math.abs(dto.quantity);
    } else {
      const isOut = dto.reason === MovementReason.SALE_OUT;
      movementType = isOut ? StockMovementType.OUT : StockMovementType.IN;
      effectiveQty = isOut ? -Math.abs(dto.quantity) : Math.abs(dto.quantity);
    }

    const movement = await this.productsRepository.createStockMovement(
      tenantId,
      productId,
      {
        type: movementType,
        reason: dto.reason,
        quantity: effectiveQty,
        warehouseId: dto.warehouseId,
        notes: dto.notes,
      },
    );
    this.eventEmitter.emit('stock.movement.created', {
      tenantId,
      productId,
      type: movementType,
      quantity: dto.quantity,
    });
    return movement;
  }

  async createGlobalMovement(
    tenantId: string,
    dto: CreateGlobalStockMovementDto,
  ) {
    const { productId, ...movementDto } = dto;
    return this.addStockMovement(tenantId, productId, movementDto);
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

    const supplier =
      await this.productSuppliersRepository.supplierExistsForTenant(
        tenantId,
        dto.supplierId,
      );
    if (!supplier) throw new BadRequestException('Proveedor no encontrado');

    const existing = await this.productSuppliersRepository.findOne(
      tenantId,
      productId,
      dto.supplierId,
    );
    if (existing)
      throw new ConflictException(
        'El proveedor ya está asociado a este producto',
      );

    if (dto.isPreferred) {
      await this.productSuppliersRepository.clearPreferred(tenantId, productId);
    }

    return this.productSuppliersRepository.create(
      tenantId,
      productId,
      dto.supplierId,
      {
        costPrice: dto.costPrice,
        isPreferred: dto.isPreferred ?? false,
      },
    );
  }

  async updateProductSupplier(
    tenantId: string,
    productId: string,
    supplierId: string,
    dto: UpdateProductSupplierDto,
  ) {
    await this.findOne(tenantId, productId);
    const link = await this.productSuppliersRepository.findOne(
      tenantId,
      productId,
      supplierId,
    );
    if (!link)
      throw new NotFoundException(
        'Asociación proveedor-producto no encontrada',
      );

    if (dto.isPreferred) {
      await this.productSuppliersRepository.clearPreferred(tenantId, productId);
    }

    await this.productSuppliersRepository.update(
      tenantId,
      productId,
      supplierId,
      dto,
    );
    return this.productSuppliersRepository.findOne(
      tenantId,
      productId,
      supplierId,
    );
  }

  async removeProductSupplier(
    tenantId: string,
    productId: string,
    supplierId: string,
  ) {
    await this.findOne(tenantId, productId);
    await this.productSuppliersRepository.delete(
      tenantId,
      productId,
      supplierId,
    );
  }
}
