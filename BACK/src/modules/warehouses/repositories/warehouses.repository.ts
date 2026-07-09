import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

export interface CreateWarehouseData {
  name: string;
  branchId?: string;
  address?: string;
  isDefault?: boolean;
}

export interface UpdateWarehouseData {
  name?: string;
  branchId?: string;
  address?: string;
  isDefault?: boolean;
  isActive?: boolean;
}

@Injectable()
export class WarehousesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(tenantId: string) {
    return this.prisma.warehouse.findMany({
      where: { tenantId },
      include: { branch: { select: { id: true, name: true } } },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  findById(tenantId: string, id: string) {
    return this.prisma.warehouse.findFirst({
      where: { id, tenantId },
      include: { branch: { select: { id: true, name: true } } },
    });
  }

  findDefault(tenantId: string) {
    return this.prisma.warehouse.findFirst({
      where: { tenantId, isDefault: true, isActive: true },
    });
  }

  create(tenantId: string, data: CreateWarehouseData) {
    return this.prisma.warehouse.create({
      data: { tenantId, ...data },
      include: { branch: { select: { id: true, name: true } } },
    });
  }

  update(tenantId: string, id: string, data: UpdateWarehouseData) {
    return this.prisma.warehouse.update({
      where: { id },
      data,
      include: { branch: { select: { id: true, name: true } } },
    });
  }
}
