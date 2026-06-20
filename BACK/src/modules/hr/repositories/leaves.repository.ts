import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class LeavesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(tenantId: string, employeeId?: string) {
    return this.prisma.leave.findMany({
      where: { tenantId, ...(employeeId ? { employeeId } : {}) },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true } },
        approvedBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  findById(id: string) {
    return this.prisma.leave.findUnique({ where: { id } });
  }

  create(data: Prisma.LeaveUncheckedCreateInput) {
    return this.prisma.leave.create({ data });
  }

  update(id: string, data: Prisma.LeaveUncheckedUpdateInput) {
    return this.prisma.leave.update({ where: { id }, data });
  }

  getBalance(employeeId: string, year: number) {
    return this.prisma.leaveBalance.findUnique({
      where: { employeeId_year: { employeeId, year } },
    });
  }

  upsertBalance(employeeId: string, tenantId: string, year: number, entitled: number) {
    return this.prisma.leaveBalance.upsert({
      where: { employeeId_year: { employeeId, year } },
      create: { employeeId, tenantId, year, entitled },
      update: { entitled },
    });
  }

  incrementBalanceTaken(employeeId: string, year: number, days: number) {
    return this.prisma.leaveBalance.update({
      where: { employeeId_year: { employeeId, year } },
      data: { taken: { increment: days }, pending: { decrement: days } },
    });
  }
}
