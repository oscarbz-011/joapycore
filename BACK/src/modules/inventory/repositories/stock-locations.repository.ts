import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaClientOrTx } from '../../../prisma/types';

@Injectable()
export class StockLocationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(
    tenantId: string,
    warehouseId: string,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.warehouse.findFirst({
      where: { id: warehouseId, tenantId },
      select: { id: true, name: true, isActive: true },
    });
  }
}
