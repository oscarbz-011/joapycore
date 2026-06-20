import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class BrandsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(tenantId: string) {
    return this.prisma.brand.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
  }

  findById(tenantId: string, id: string) {
    return this.prisma.brand.findFirst({ where: { tenantId, id } });
  }

  findByName(tenantId: string, name: string) {
    return this.prisma.brand.findUnique({
      where: { tenantId_name: { tenantId, name } },
    });
  }

  create(tenantId: string, name: string) {
    return this.prisma.brand.create({ data: { tenantId, name } });
  }

  update(
    tenantId: string,
    id: string,
    data: { name?: string; isActive?: boolean },
  ) {
    return this.prisma.brand.updateMany({ where: { tenantId, id }, data });
  }
}
