import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

export interface CreateBranchData {
  name: string;
  address?: string;
  city?: string;
  phone?: string;
  isMain?: boolean;
}

export interface UpdateBranchData {
  name?: string;
  address?: string;
  city?: string;
  phone?: string;
  isMain?: boolean;
  isActive?: boolean;
}

@Injectable()
export class BranchesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(tenantId: string) {
    return this.prisma.branch.findMany({
      where: { tenantId },
      orderBy: [{ isMain: 'desc' }, { name: 'asc' }],
    });
  }

  findById(tenantId: string, id: string) {
    return this.prisma.branch.findFirst({ where: { id, tenantId } });
  }

  create(tenantId: string, data: CreateBranchData) {
    return this.prisma.branch.create({ data: { tenantId, ...data } });
  }

  update(tenantId: string, id: string, data: UpdateBranchData) {
    return this.prisma.branch.update({ where: { id }, data });
  }
}
