import type { DocumentType, Prisma } from '@prisma/client';
import { Injectable } from '@nestjs/common';
import {
  accentVariants,
  normalizeSearch,
} from '../../../common/pagination/pagination';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaClientOrTx } from '../../../prisma/types';
import { CreateCustomerDto } from '../dto/create-customer.dto';

// Datos del cliente en los que busca el listado.
const SEARCHED = [
  'firstName',
  'secondFirstName',
  'lastName',
  'secondLastName',
  'documentNumber',
  'customerCode',
  'email',
  'phone',
] as const;

@Injectable()
export class CustomersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(tenantId: string) {
    return this.prisma.customer.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { lastName: 'asc' },
    });
  }

  // Una página de clientes, con el total de los que cumplen la búsqueda.
  // Cada palabra tiene que aparecer en alguno de los datos del cliente.
  async findPage(
    tenantId: string,
    query: {
      words: string[];
      orderBy: Prisma.CustomerOrderByWithRelationInput[];
      skip: number;
      take: number;
    },
  ) {
    const where: Prisma.CustomerWhereInput = {
      tenantId,
      deletedAt: null,
      AND: query.words.map((word) => ({
        OR: [
          // Sin distinguir acentos, contra el texto que mantiene la base.
          { searchText: { contains: normalizeSearch(word) } },
          // Base creada sin migraciones: no tiene ese texto. Se busca campo
          // por campo, que sí distingue acentos.
          {
            searchText: null,
            OR: SEARCHED.flatMap((field) =>
              accentVariants(word).map((variant) => ({
                [field]: { contains: variant, mode: 'insensitive' as const },
              })),
            ),
          },
        ],
      })),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        orderBy: query.orderBy,
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.customer.count({ where }),
    ]);
    return { items, total };
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
