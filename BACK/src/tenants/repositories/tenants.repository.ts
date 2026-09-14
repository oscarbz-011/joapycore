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

  // Casa Matriz + Depósito Principal que todo tenant nuevo necesita.
  async createHeadquarters(
    tenantId: string,
    client: PrismaClientOrTx = this.prisma,
  ) {
    const branch = await client.branch.create({
      data: { tenantId, name: 'Casa Matriz', isMain: true },
    });
    const warehouse = await client.warehouse.create({
      data: {
        tenantId,
        branchId: branch.id,
        name: 'Depósito Principal',
        isDefault: true,
      },
    });
    return { branch, warehouse };
  }

  findById(id: string) {
    return this.prisma.tenant.findUnique({ where: { id } });
  }

  update(id: string, data: Prisma.TenantUncheckedUpdateInput) {
    return this.prisma.tenant.update({ where: { id }, data });
  }
}
