import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Product, ProductPresentation } from '@prisma/client';
import {
  factorFromDimensions,
  measureOf,
} from '../../../common/units/dimensions';
import { assertDecimalsForUnit } from '../../../common/units/quantity';
import { DEFAULT_UNIT_CODE } from '../../../common/units/units-of-measure';
import {
  CreateProductPresentationDto,
  UpdateProductPresentationDto,
} from '../dto/product-presentation.dto';
import { ProductPresentationsRepository } from '../repositories/product-presentations.repository';
import { ProductsRepository } from '../repositories/products.repository';

const isUniqueViolation = (error: unknown) =>
  (error as { code?: string }).code === 'P2002';

const definedOnly = <T extends object>(values: T): Partial<T> =>
  Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined),
  ) as Partial<T>;

@Injectable()
export class ProductPresentationsService {
  constructor(
    private readonly products: ProductsRepository,
    private readonly presentations: ProductPresentationsRepository,
  ) {}

  async list(tenantId: string, productId: string) {
    await this.findProduct(tenantId, productId);
    return this.presentations.findByProduct(tenantId, productId);
  }

  async create(
    tenantId: string,
    productId: string,
    dto: CreateProductPresentationDto,
  ) {
    const product = await this.findProduct(tenantId, productId);
    const measures = this.measures(product, dto);
    return this.saveUnique(() =>
      this.presentations.create(tenantId, productId, {
        name: dto.name.trim(),
        unitCode: dto.unitCode ?? DEFAULT_UNIT_CODE,
        salePrice: dto.salePrice,
        ...measures,
      }),
    );
  }

  async update(
    tenantId: string,
    productId: string,
    id: string,
    dto: UpdateProductPresentationDto,
  ) {
    const product = await this.findProduct(tenantId, productId);
    const current = await this.presentations.findOne(tenantId, productId, id);
    if (!current) throw new NotFoundException('Presentación no encontrada');
    const measuresChanged = [
      dto.factor,
      dto.length,
      dto.width,
      dto.height,
    ].some((value) => value !== undefined);
    return this.saveUnique(() =>
      this.presentations.update(tenantId, productId, id, {
        name: dto.name?.trim(),
        unitCode: dto.unitCode,
        salePrice: dto.salePrice,
        isActive: dto.isActive,
        ...(measuresChanged
          ? this.measures(product, {
              ...this.currentMeasures(product, current),
              ...definedOnly({
                factor: dto.factor,
                length: dto.length,
                width: dto.width,
                height: dto.height,
              }),
            })
          : {}),
      }),
    );
  }

  private async findProduct(tenantId: string, productId: string) {
    const product = await this.products.findById(tenantId, productId);
    if (!product) throw new NotFoundException('Producto no encontrado');
    if (product.isSerialized) {
      throw new UnprocessableEntityException(
        'Un producto con número de serie se vende por unidad: no lleva presentaciones',
      );
    }
    return product;
  }

  /**
   * Lo medido (m, m², m³) sale de las dimensiones; lo demás se carga como
   * factor y respeta la unidad del producto (un pack de unidades va entero).
   */
  private measures(
    product: Product,
    dto: Pick<
      CreateProductPresentationDto,
      'factor' | 'length' | 'width' | 'height'
    >,
  ) {
    const dimensions = {
      length: dto.length ?? null,
      width: dto.width ?? null,
      height: dto.height ?? null,
    };
    if (measureOf(product.unitCode)) {
      if (dto.factor != null) {
        throw new UnprocessableEntityException(
          'En un producto que se mide, la presentación se define con sus medidas',
        );
      }
      return {
        factor: factorFromDimensions(product.unitCode, dimensions),
        ...dimensions,
      };
    }
    if (Object.values(dimensions).some((value) => value != null)) {
      factorFromDimensions(product.unitCode, dimensions);
    }
    if (dto.factor == null) {
      throw new UnprocessableEntityException(
        'Indicá cuánto del producto lleva la presentación',
      );
    }
    return {
      factor: assertDecimalsForUnit(dto.factor, product),
      length: null,
      width: null,
      height: null,
    };
  }

  // Lo guardado, para completar una edición que cambia solo una medida.
  private currentMeasures(product: Product, current: ProductPresentation) {
    if (!measureOf(product.unitCode)) {
      return { factor: current.factor.toNumber() };
    }
    const value = (v: { toNumber(): number } | null) => v?.toNumber();
    return {
      length: value(current.length),
      width: value(current.width),
      height: value(current.height),
    };
  }

  private async saveUnique<T>(save: () => Promise<T>): Promise<T> {
    try {
      return await save();
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'Ya existe una presentación con ese nombre para este producto',
        );
      }
      throw error;
    }
  }
}
