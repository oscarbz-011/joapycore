import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

import type {
  QuantityDiscount,
  VolumeDiscount,
} from '../commercial-terms.util';

export interface SupplierTerms {
  volumeDiscounts?: VolumeDiscount[];
  quantityDiscounts?: QuantityDiscount[];
}

// Misma forma que los tramos que recibe la API: el front no ve las filas.
const TERMS_INCLUDE = {
  volumeDiscounts: {
    select: { minAmount: true, percent: true },
    orderBy: { minAmount: 'asc' },
  },
  quantityDiscounts: {
    select: { minQuantity: true, percent: true },
    orderBy: { minQuantity: 'asc' },
  },
} as const;

@Injectable()
export class SuppliersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(tenantId: string) {
    return this.prisma.supplier.findMany({
      where: { tenantId, deletedAt: null },
      include: TERMS_INCLUDE,
      orderBy: { name: 'asc' },
    });
  }

  findById(tenantId: string, id: string) {
    return this.prisma.supplier.findFirst({
      where: { tenantId, id, deletedAt: null },
      include: TERMS_INCLUDE,
    });
  }

  create(
    tenantId: string,
    data: Omit<
      Prisma.SupplierUncheckedCreateInput,
      'tenantId' | 'volumeDiscounts' | 'quantityDiscounts'
    >,
    terms: Required<SupplierTerms>,
  ) {
    return this.prisma.supplier.create({
      data: {
        ...data,
        tenantId,
        volumeDiscounts: {
          create: terms.volumeDiscounts.map((d) => ({ ...d, tenantId })),
        },
        quantityDiscounts: {
          create: terms.quantityDiscounts.map((d) => ({ ...d, tenantId })),
        },
      },
      include: TERMS_INCLUDE,
    });
  }

  // Los tramos que llegan reemplazan a los guardados, junto con los datos
  // del proveedor: o cambia todo o nada.
  update(
    tenantId: string,
    id: string,
    data: Prisma.SupplierUpdateManyMutationInput,
    terms: SupplierTerms = {},
  ) {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.supplier.updateMany({
        where: { tenantId, id, deletedAt: null },
        data,
      });
      if (count === 0) return count;
      if (terms.volumeDiscounts) {
        await tx.supplierVolumeDiscount.deleteMany({
          where: { tenantId, supplierId: id },
        });
        await tx.supplierVolumeDiscount.createMany({
          data: terms.volumeDiscounts.map((d) => ({
            ...d,
            tenantId,
            supplierId: id,
          })),
        });
      }
      if (terms.quantityDiscounts) {
        await tx.supplierQuantityDiscount.deleteMany({
          where: { tenantId, supplierId: id },
        });
        await tx.supplierQuantityDiscount.createMany({
          data: terms.quantityDiscounts.map((d) => ({
            ...d,
            tenantId,
            supplierId: id,
          })),
        });
      }
      return count;
    });
  }

  softDelete(tenantId: string, id: string) {
    return this.prisma.supplier.updateMany({
      where: { tenantId, id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }
}
