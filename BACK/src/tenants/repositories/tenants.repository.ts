import { Injectable } from '@nestjs/common';
import { EmployeeCount, Industry, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PrismaClientOrTx } from '../../prisma/types';

interface CreateTenantData {
  name: string;
  industry?: Industry | null;
  plan?: string;
  employeeCount?: EmployeeCount;
}

@Injectable()
export class TenantsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: CreateTenantData, client: PrismaClientOrTx = this.prisma) {
    return client.tenant.create({ data });
  }

  findById(id: string) {
    return this.prisma.tenant.findUnique({ where: { id } });
  }

  update(id: string, data: Prisma.TenantUncheckedUpdateInput) {
    return this.prisma.tenant.update({ where: { id }, data });
  }
}
