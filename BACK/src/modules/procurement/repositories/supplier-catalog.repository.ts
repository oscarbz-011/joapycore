import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaClientOrTx } from '../../../prisma/types';
import { startOfBusinessDay } from '../../../common/utils/business-date.util';

export interface CatalogFilters {
  search?: string;
  /** true = solo sin mapear a un producto interno; false = solo mapeados. */
  unmapped?: boolean;
  /** Excluye ítems cuya vigencia ya venció. */
  onlyValid?: boolean;
}

const ITEM_INCLUDE = {
  product: { select: { id: true, name: true, unit: true } },
} as const;

@Injectable()
export class SupplierCatalogRepository {
  constructor(private readonly prisma: PrismaService) {}

  findBySupplier(
    tenantId: string,
    supplierId: string,
    filters: CatalogFilters = {},
  ) {
    // La vigencia son días de calendario: un precio válido hasta el día D
    // rige todo ese día en la zona del negocio.
    const today = startOfBusinessDay();
    return this.prisma.supplierCatalogItem.findMany({
      where: {
        tenantId,
        supplierId,
        ...(filters.unmapped !== undefined && {
          productId: filters.unmapped ? null : { not: null },
        }),
        // Un ítem sin vigencia cargada se considera vigente: la mayoría de las
        // listas de precios no traen fechas.
        ...(filters.onlyValid && {
          AND: [
            { OR: [{ validFrom: null }, { validFrom: { lte: today } }] },
            { OR: [{ validTo: null }, { validTo: { gte: today } }] },
          ],
        }),
        ...(filters.search && {
          OR: [
            { description: { contains: filters.search, mode: 'insensitive' } },
            { supplierSku: { contains: filters.search, mode: 'insensitive' } },
          ],
        }),
      },
      include: ITEM_INCLUDE,
      orderBy: { description: 'asc' },
    });
  }

  // Qué proveedores ofrecen estos productos, con sus condiciones comerciales:
  // la materia prima del comparador. Solo proveedores activos.
  findOffers(tenantId: string, productIds: string[]) {
    return this.prisma.supplierCatalogItem.findMany({
      where: {
        tenantId,
        productId: { in: productIds },
        supplier: { tenantId, isActive: true, deletedAt: null },
      },
      include: {
        ...ITEM_INCLUDE,
        supplier: {
          select: {
            id: true,
            name: true,
            email: true,
            paymentTermDays: true,
            shippingCost: true,
            leadTimeDays: true,
            minOrderAmount: true,
            volumeDiscounts: true,
          },
        },
      },
      orderBy: [{ supplier: { name: 'asc' } }, { description: 'asc' }],
    });
  }

  findById(tenantId: string, id: string) {
    return this.prisma.supplierCatalogItem.findFirst({
      where: { tenantId, id },
      include: ITEM_INCLUDE,
    });
  }

  update(
    tenantId: string,
    id: string,
    data: Prisma.SupplierCatalogItemUncheckedUpdateInput,
  ) {
    return this.prisma.supplierCatalogItem.updateMany({
      where: { tenantId, id },
      data,
    });
  }

  delete(tenantId: string, id: string) {
    return this.prisma.supplierCatalogItem.deleteMany({
      where: { tenantId, id },
    });
  }

  // Upsert por (proveedor, código del proveedor): reimportar la lista de
  // precios actualiza los ítems que ya existían en vez de duplicarlos, y
  // conserva el `productId` que ya se hubiera mapeado a mano.
  upsert(
    tenantId: string,
    supplierId: string,
    data: {
      supplierSku: string;
      description: string;
      price?: number | null;
      supplierUnit?: string | null;
      conversionFactor?: number | null;
      validFrom?: Date | null;
      validTo?: Date | null;
    },
    client: PrismaClientOrTx = this.prisma,
  ) {
    const { supplierSku, ...rest } = data;
    return client.supplierCatalogItem.upsert({
      where: { supplierId_supplierSku: { supplierId, supplierSku } },
      create: { tenantId, supplierId, supplierSku, ...rest },
      update: rest,
    });
  }

  countBySupplier(tenantId: string, supplierId: string) {
    return this.prisma.supplierCatalogItem.count({
      where: { tenantId, supplierId },
    });
  }

  supplierExists(tenantId: string, supplierId: string) {
    return this.prisma.supplier.findFirst({
      where: { tenantId, id: supplierId, deletedAt: null },
      select: { id: true, name: true },
    });
  }

  productExists(tenantId: string, productId: string) {
    return this.prisma.product.findFirst({
      where: { tenantId, id: productId, deletedAt: null },
      select: { id: true, name: true },
    });
  }
}
