import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomUUID } from 'crypto';
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
import { PrismaService } from '../../../prisma/prisma.service';
import { WarehousesRepository } from '../../warehouses/repositories/warehouses.repository';
import { StockMovementsRepository } from '../repositories/stock-movements.repository';
import {
  aggregateDemands,
  assertDemandsCovered,
} from '../../../common/utils/stock-availability.util';

@Injectable()
export class ProductsService {
  constructor(
    private readonly productsRepository: ProductsRepository,
    private readonly productUnitsRepository: ProductUnitsRepository,
    private readonly productSuppliersRepository: ProductSuppliersRepository,
    private readonly productBatchesRepository: ProductBatchesRepository,
    private readonly eventEmitter: EventEmitter2,
    private readonly prisma: PrismaService,
    private readonly warehousesRepository: WarehousesRepository,
    private readonly stockMovementsRepository: StockMovementsRepository,
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
    const salesChannels =
      dto.salesChannels ?? defaultSalesChannelsForKind(kind);

    return this.productsRepository.create(tenantId, {
      kind,
      isPurchasable: dto.isPurchasable ?? flags.isPurchasable,
      // Con sellOnFirstReceipt los canales quedan en espera: los abre el
      // ingreso de la primera recepción de compra (ver
      // InventoryOnPurchaseReceiptListener).
      salesChannels: dto.sellOnFirstReceipt ? [] : salesChannels,
      salesChannelsOnReceipt: dto.sellOnFirstReceipt ? salesChannels : [],
      categoryId: dto.categoryId,
      brandId: dto.brandId,
      model: dto.model,
      name: dto.name,
      description: dto.description,
      isSerialized: dto.isSerialized,
      usesLots: dto.usesLots ?? false,
      stockMin: dto.stockMin,
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
    await this.assertActiveWarehouse(tenantId, dto.warehouseId);
    const result = await this.productUnitsRepository.createMany(
      tenantId,
      productId,
      dto.serialNumbers,
      { warehouseId: dto.warehouseId },
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
    if (!dto.warehouseId) {
      throw new UnprocessableEntityException(
        'Se requiere el depósito de origen',
      );
    }
    await this.assertActiveWarehouse(tenantId, dto.warehouseId);

    if (dto.reason === MovementReason.TRANSFER) {
      if (!dto.toWarehouseId) {
        throw new BadRequestException(
          'Se requiere el depósito de destino para transferencias',
        );
      }
      if (dto.toWarehouseId === dto.warehouseId) {
        throw new BadRequestException(
          'Los depósitos de origen y destino deben ser distintos',
        );
      }
      await this.assertActiveWarehouse(tenantId, dto.toWarehouseId);
    }

    if (dto.reason === MovementReason.ADJUSTMENT && !dto.direction) {
      throw new BadRequestException(
        'Se requiere la dirección (IN/OUT) para ajustes de inventario',
      );
    }

    const serialNumbers = dto.serialNumbers ?? [];
    if (product.isSerialized && serialNumbers.length !== dto.quantity) {
      throw new UnprocessableEntityException(
        `Se requieren ${dto.quantity} números de serie para ${product.name}`,
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      if (product.isSerialized) {
        const referenceId = randomUUID();
        if (dto.reason === MovementReason.TRANSFER) {
          const moved = await this.productUnitsRepository.moveInStockUnits(
            tenantId,
            productId,
            serialNumbers,
            dto.warehouseId,
            dto.toWarehouseId!,
            tx,
          );
          if (moved !== dto.quantity) {
            throw new UnprocessableEntityException(
              'Una o más series no están disponibles en el depósito de origen',
            );
          }
          const out = await this.stockMovementsRepository.create(
            {
              tenantId,
              productId,
              type: StockMovementType.OUT,
              reason: MovementReason.TRANSFER,
              quantity: -dto.quantity,
              warehouseId: dto.warehouseId,
              referenceId,
              notes: dto.notes,
            },
            tx,
          );
          const incoming = await this.stockMovementsRepository.create(
            {
              tenantId,
              productId,
              type: StockMovementType.IN,
              reason: MovementReason.TRANSFER,
              quantity: dto.quantity,
              warehouseId: dto.toWarehouseId,
              referenceId,
              notes: dto.notes,
            },
            tx,
          );
          return [out, incoming];
        }

        if (
          dto.reason === MovementReason.ADJUSTMENT &&
          dto.direction === 'OUT'
        ) {
          const changed = await this.productUnitsRepository.markAdjustedOut(
            tenantId,
            productId,
            serialNumbers,
            dto.warehouseId,
            tx,
          );
          if (changed !== dto.quantity) {
            throw new UnprocessableEntityException(
              'Una o más series no están disponibles en el depósito indicado',
            );
          }
          return this.stockMovementsRepository.create(
            {
              tenantId,
              productId,
              type: StockMovementType.ADJUSTMENT,
              reason: MovementReason.ADJUSTMENT,
              quantity: -dto.quantity,
              warehouseId: dto.warehouseId,
              referenceId,
              notes: dto.notes,
            },
            tx,
          );
        }

        const restored = await this.productUnitsRepository.restoreAdjustedOut(
          tenantId,
          productId,
          serialNumbers,
          dto.warehouseId,
          tx,
        );
        const created = await this.productUnitsRepository.createMany(
          tenantId,
          productId,
          serialNumbers,
          { warehouseId: dto.warehouseId },
          tx,
        );
        if (restored + created.count !== dto.quantity) {
          throw new UnprocessableEntityException(
            'Una o más series ya existen y no se pueden ingresar nuevamente',
          );
        }
        return this.stockMovementsRepository.create(
          {
            tenantId,
            productId,
            type:
              dto.reason === MovementReason.ADJUSTMENT
                ? StockMovementType.ADJUSTMENT
                : StockMovementType.IN,
            reason: dto.reason,
            quantity: dto.quantity,
            warehouseId: dto.warehouseId,
            referenceId,
            notes: dto.notes,
          },
          tx,
        );
      }

      const isTransfer = dto.reason === MovementReason.TRANSFER;
      const isOut =
        isTransfer ||
        dto.reason === MovementReason.SALE_OUT ||
        (dto.reason === MovementReason.ADJUSTMENT && dto.direction === 'OUT');
      if (isOut) {
        const demand = {
          productId,
          warehouseId: dto.warehouseId,
          quantity: dto.quantity,
          name: product.name,
        };
        await this.stockMovementsRepository.lockProducts(tx, tenantId, [
          productId,
        ]);
        const available =
          await this.stockMovementsRepository.sumByProductsAndWarehouse(
            tenantId,
            [demand],
            tx,
          );
        assertDemandsCovered(aggregateDemands([demand]), available);
      }

      if (isTransfer) {
        const referenceId = randomUUID();
        const out = await this.stockMovementsRepository.create(
          {
            tenantId,
            productId,
            type: StockMovementType.OUT,
            reason: MovementReason.TRANSFER,
            quantity: -dto.quantity,
            warehouseId: dto.warehouseId,
            referenceId,
            notes: dto.notes,
          },
          tx,
        );
        const incoming = await this.stockMovementsRepository.create(
          {
            tenantId,
            productId,
            type: StockMovementType.IN,
            reason: MovementReason.TRANSFER,
            quantity: dto.quantity,
            warehouseId: dto.toWarehouseId,
            referenceId,
            notes: dto.notes,
          },
          tx,
        );
        return [out, incoming];
      }

      const movementType =
        dto.reason === MovementReason.ADJUSTMENT
          ? StockMovementType.ADJUSTMENT
          : isOut
            ? StockMovementType.OUT
            : StockMovementType.IN;
      return this.stockMovementsRepository.create(
        {
          tenantId,
          productId,
          type: movementType,
          reason: dto.reason,
          quantity: isOut ? -dto.quantity : dto.quantity,
          warehouseId: dto.warehouseId,
          notes: dto.notes,
        },
        tx,
      );
    });

    if (dto.reason === MovementReason.TRANSFER) {
      this.eventEmitter.emit('stock.movement.created', {
        tenantId,
        productId,
        type: 'TRANSFER',
        quantity: dto.quantity,
      });
    } else {
      this.eventEmitter.emit('stock.movement.created', {
        tenantId,
        productId,
        type:
          dto.reason === MovementReason.ADJUSTMENT
            ? StockMovementType.ADJUSTMENT
            : StockMovementType.IN,
        quantity: dto.quantity,
      });
    }
    return result;
  }

  private async assertActiveWarehouse(tenantId: string, warehouseId: string) {
    const warehouse = await this.warehousesRepository.findById(
      tenantId,
      warehouseId,
    );
    if (!warehouse?.isActive) {
      throw new UnprocessableEntityException(
        'El depósito no existe o está inactivo',
      );
    }
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
