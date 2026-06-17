import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PrismaClientOrTx } from '../../prisma/types';

interface CreateTenantData {
  name: string;
  plan?: string;
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

  update(id: string, data: Prisma.TenantUpdateInput) {
    return this.prisma.tenant.update({ where: { id }, data });
  }
}
