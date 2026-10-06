import type { DocumentType } from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaClientOrTx } from '../../../prisma/types';
import { CreateCustomerDto } from '../dto/create-customer.dto';

@Injectable()
export class CustomersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(tenantId: string) {
    return this.prisma.customer.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { lastName: 'asc' },
    });
  }

  // Cliente genérico "Consumidor Final" del tenant (ventas de mostrador).
  async findOrCreateWalkIn(
    tenantId: string,
    client: PrismaClientOrTx = this.prisma,
  ): Promise<string> {
    const existing = await client.customer.findFirst({
      where: { tenantId, firstName: 'Consumidor', lastName: 'Final' },
      select: { id: true },
    });
    if (existing) return existing.id;
    const created = await client.customer.create({
      data: { tenantId, firstName: 'Consumidor', lastName: 'Final' },
      select: { id: true },
    });
    return created.id;
  }

  findById(tenantId: string, id: string) {
    return this.prisma.customer.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
  }

  // Mismo tipo y número de documento entre clientes activos del tenant.
  findByDocument(
    tenantId: string,
    documentType: DocumentType | null,
    documentNumber: string,
    excludeId?: string,
  ) {
    return this.prisma.customer.findFirst({
      where: {
        tenantId,
        documentType,
        documentNumber,
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true, customerCode: true },
    });
  }

  findByEmail(tenantId: string, email: string, excludeId?: string) {
    return this.prisma.customer.findFirst({
      where: {
        tenantId,
        email,
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
  }

  findLastCode(tenantId: string) {
    return this.prisma.customer.findFirst({
      where: { tenantId, customerCode: { startsWith: 'CLI-' } },
      orderBy: { customerCode: 'desc' },
      select: { customerCode: true },
    });
  }

  create(tenantId: string, dto: CreateCustomerDto & { customerCode?: string }) {
    return this.prisma.customer.create({ data: { tenantId, ...dto } });
  }

  update(tenantId: string, id: string, dto: Partial<CreateCustomerDto>) {
    return this.prisma.customer.update({ where: { id }, data: dto });
  }

  // updateMany para que el tenant forme parte del filtro de la escritura.
  setUncollectible(
    tenantId: string,
    id: string,
    mark: { uncollectibleAt: Date | null; uncollectibleReason: string | null },
  ) {
    return this.prisma.customer.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: mark,
    });
  }

  softDelete(tenantId: string, id: string) {
    return this.prisma.customer.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
