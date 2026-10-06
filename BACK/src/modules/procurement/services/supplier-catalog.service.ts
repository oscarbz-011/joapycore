import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { normalizePriceTiers } from '../commercial-terms.util';
import {
  SupplierCatalogRepository,
  type CatalogFilters,
} from '../repositories/supplier-catalog.repository';
import { CatalogParserService, type RowError } from './catalog-parser.service';
import {
  CatalogValidityDto,
  UpdateCatalogItemDto,
  MapCatalogItemDto,
} from '../dto/update-catalog-item.dto';
import type { AuditLogEvent } from '../../../audit/audit-log.event';

export interface ImportResult {
  imported: number;
  /** Filas rechazadas, con el número de fila del archivo. */
  errors: RowError[];
  totalRows: number;
}

const toDay = (value: string | null | undefined): Date | null =>
  value ? new Date(`${value}T00:00:00.000Z`) : null;

function assertValidRange(from: Date | null, to: Date | null) {
  if (from && to && to < from) {
    throw new UnprocessableEntityException(
      'La vigencia no puede terminar antes de empezar',
    );
  }
}

@Injectable()
export class SupplierCatalogService {
  constructor(
    private readonly repository: SupplierCatalogRepository,
    private readonly parser: CatalogParserService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async findBySupplier(
    tenantId: string,
    supplierId: string,
    filters: CatalogFilters,
  ) {
    await this.getSupplierOrFail(tenantId, supplierId);
    return this.repository.findBySupplier(tenantId, supplierId, filters);
  }

  findOffers(tenantId: string, productIds: string[]) {
    return this.repository.findOffers(tenantId, productIds);
  }

  async importFile(
    tenantId: string,
    supplierId: string,
    file: { buffer: Buffer; originalname: string },
    userId?: string,
    validity: CatalogValidityDto = {},
  ): Promise<ImportResult> {
    await this.getSupplierOrFail(tenantId, supplierId);

    // La vigencia es de la lista entera. Una lista nueva pisa la anterior
    // también cuando no trae fechas: sus precios ya no son los de antes.
    const validFrom = toDay(validity.validFrom);
    const validTo = toDay(validity.validTo);
    assertValidRange(validFrom, validTo);

    const { rows, errors } = await this.parser.parse(
      file.buffer,
      file.originalname,
    );

    // Si no entró ni una fila, es un archivo mal armado y no un problema de
    // datos sueltos: se avisa fuerte en vez de reportar "0 importados".
    if (rows.length === 0) {
      throw new UnprocessableEntityException(
        errors.length
          ? `Ninguna fila del archivo es válida. Primer problema: fila ${errors[0].row} — ${errors[0].message}`
          : 'El archivo no tiene filas para importar',
      );
    }

    // Upsert fila por fila: la lista de precios de un proveedor está en el
    // orden de cientos, no de millones, y así una fila que falle en la base no
    // tumba la importación entera.
    for (const row of rows) {
      await this.repository.upsert(tenantId, supplierId, {
        ...row,
        validFrom,
        validTo,
      });
    }

    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'procurement',
      action: 'supplier.catalog.imported',
      resourceId: supplierId,
      after: {
        imported: rows.length,
        rejected: errors.length,
        validFrom: validity.validFrom ?? null,
        validTo: validity.validTo ?? null,
      },
    } satisfies AuditLogEvent);

    return {
      imported: rows.length,
      errors,
      totalRows: rows.length + errors.length,
    };
  }

  async update(tenantId: string, id: string, dto: UpdateCatalogItemDto) {
    const item = await this.getItemOrFail(tenantId, id);
    const { validFrom, validTo, priceTiers, availability, ...fields } = dto;

    // undefined = no se toca; null = se borra. El rango se valida contra lo
    // que va a quedar guardado, no solo contra lo que trae este cambio.
    const validity = {
      ...(validFrom !== undefined && { validFrom: toDay(validFrom) }),
      ...(validTo !== undefined && { validTo: toDay(validTo) }),
    };
    assertValidRange(
      validFrom !== undefined ? toDay(validFrom) : (item.validFrom ?? null),
      validTo !== undefined ? toDay(validTo) : (item.validTo ?? null),
    );

    await this.repository.update(tenantId, id, {
      ...fields,
      ...validity,
      // La fecha dice qué tan viejo es el dato: se sella cada vez que alguien
      // informa la disponibilidad, aunque repita el mismo valor.
      ...(availability !== undefined && {
        availability,
        availabilityUpdatedAt: availability ? new Date() : null,
      }),
      ...(priceTiers !== undefined && {
        priceTiers: normalizePriceTiers(
          priceTiers,
          dto.price ?? (item.price == null ? null : Number(item.price)),
        ) as unknown as Prisma.InputJsonValue,
      }),
    });
    return this.repository.findById(tenantId, id);
  }

  // Vincular o desvincular del catálogo interno. Es la operación central de la
  // fase de mapeo: hasta que no pasa, el ítem no puede entrar en una orden.
  async mapToProduct(tenantId: string, id: string, dto: MapCatalogItemDto) {
    await this.getItemOrFail(tenantId, id);

    if (dto.productId) {
      const product = await this.repository.productExists(
        tenantId,
        dto.productId,
      );
      if (!product) throw new NotFoundException('Producto no encontrado');
    }

    await this.repository.update(tenantId, id, {
      productId: dto.productId ?? null,
    });
    return this.repository.findById(tenantId, id);
  }

  async remove(tenantId: string, id: string) {
    await this.getItemOrFail(tenantId, id);
    await this.repository.delete(tenantId, id);
  }

  private async getSupplierOrFail(tenantId: string, supplierId: string) {
    const supplier = await this.repository.supplierExists(tenantId, supplierId);
    if (!supplier) throw new NotFoundException('Proveedor no encontrado');
    return supplier;
  }

  private async getItemOrFail(tenantId: string, id: string) {
    const item = await this.repository.findById(tenantId, id);
    if (!item) throw new NotFoundException('Ítem de catálogo no encontrado');
    return item;
  }
}
