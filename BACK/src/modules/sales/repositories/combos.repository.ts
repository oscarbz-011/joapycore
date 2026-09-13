import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateComboDto } from '../dto/create-combo.dto';
import { UpdateComboDto } from '../dto/update-combo.dto';

const itemsInclude = {
  items: {
    include: {
      product: {
        select: { id: true, name: true, salePrice: true, isSerialized: true },
      },
    },
  },
} as const;

@Injectable()
export class CombosRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(tenantId: string, onlyActive = false) {
    return this.prisma.saleCombo.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(onlyActive ? { isActive: true } : {}),
      },
      include: itemsInclude,
      orderBy: { name: 'asc' },
    });
  }

  findById(tenantId: string, id: string) {
    return this.prisma.saleCombo.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: itemsInclude,
    });
  }

  create(tenantId: string, dto: CreateComboDto) {
    return this.prisma.saleCombo.create({
      data: {
        tenantId,
        name: dto.name,
        description: dto.description,
        priceMode: dto.priceMode,
        fixedPrice: dto.fixedPrice,
        discountPercentage: dto.discountPercentage,
        items: {
          create: dto.items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
          })),
        },
      },
      include: itemsInclude,
    });
  }

  update(tenantId: string, id: string, dto: UpdateComboDto) {
    return this.prisma.$transaction(async (tx) => {
      if (dto.items) {
        await tx.saleComboItem.deleteMany({ where: { comboId: id } });
      }
      return tx.saleCombo.update({
        where: { id },
        data: {
          name: dto.name,
          description: dto.description,
          priceMode: dto.priceMode,
          fixedPrice: dto.fixedPrice,
          discountPercentage: dto.discountPercentage,
          isActive: dto.isActive,
          ...(dto.items
            ? {
                items: {
                  create: dto.items.map((i) => ({
                    productId: i.productId,
                    quantity: i.quantity,
                  })),
                },
              }
            : {}),
        },
        include: itemsInclude,
      });
    });
  }

  softDelete(tenantId: string, id: string) {
    return this.prisma.saleCombo.updateMany({
      where: { tenantId, id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }
}
