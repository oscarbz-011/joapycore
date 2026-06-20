import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

const WITH_RELATIONS = {
  user: { select: { id: true, email: true, status: true, mustChangePassword: true } },
  area: { select: { id: true, name: true } },
  position: { select: { id: true, name: true } },
  manager: { select: { id: true, firstName: true, lastName: true } },
} as const;

@Injectable()
export class EmployeesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async nextEmployeeNumber(tenantId: string): Promise<number> {
    const last = await this.prisma.employee.findFirst({
      where: { tenantId },
      orderBy: { employeeNumber: 'desc' },
      select: { employeeNumber: true },
    });
    return (last?.employeeNumber ?? 0) + 1;
  }

  findAll(tenantId: string) {
    return this.prisma.employee.findMany({
      where: { tenantId, deletedAt: null },
      include: WITH_RELATIONS,
      orderBy: { employeeNumber: 'asc' },
    });
  }

  findById(tenantId: string, id: string) {
    return this.prisma.employee.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: WITH_RELATIONS,
    });
  }

  findByUserId(userId: string) {
    return this.prisma.employee.findUnique({ where: { userId } });
  }

  create(data: Prisma.EmployeeUncheckedCreateInput) {
    return this.prisma.employee.create({ data, include: WITH_RELATIONS });
  }

  async update(tenantId: string, id: string, data: Prisma.EmployeeUncheckedUpdateInput) {
    await this.prisma.employee.updateMany({ where: { id, tenantId }, data });
    return this.findById(tenantId, id);
  }

  linkUser(tenantId: string, id: string, userId: string) {
    return this.prisma.employee.updateMany({ where: { id, tenantId }, data: { userId } });
  }
}
