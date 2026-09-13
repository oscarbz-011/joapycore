import { Injectable } from '@nestjs/common';
import { LeaveStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

type Client = PrismaService | Prisma.TransactionClient;

const WITH_PEOPLE = {
  employee: {
    select: { id: true, firstName: true, lastName: true, employeeNumber: true },
  },
  approvedBy: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.LeaveInclude;

export interface LeaveFilters {
  employeeId?: string;
  status?: LeaveStatus;
  year?: number;
}

@Injectable()
export class LeavesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(tenantId: string, filters: LeaveFilters = {}) {
    return this.prisma.leave.findMany({
      where: {
        tenantId,
        ...(filters.employeeId ? { employeeId: filters.employeeId } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.year
          ? {
              startDate: {
                gte: new Date(Date.UTC(filters.year, 0, 1)),
                lt: new Date(Date.UTC(filters.year + 1, 0, 1)),
              },
            }
          : {}),
      },
      include: WITH_PEOPLE,
      orderBy: { startDate: 'desc' },
    });
  }

  findById(tenantId: string, id: string, client: Client = this.prisma) {
    return client.leave.findFirst({
      where: { id, tenantId },
      include: WITH_PEOPLE,
    });
  }

  /**
   * Serializa las solicitudes de un mismo empleado dentro de la transacción:
   * sin esto, dos pedidos simultáneos leen el mismo saldo disponible y
   * superposición, y pasan los dos.
   */
  async lockEmployee(
    tenantId: string,
    employeeId: string,
    client: Prisma.TransactionClient,
  ): Promise<void> {
    await client.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`leave:${tenantId}:${employeeId}`}, 0))`;
  }

  /** Licencias pendientes o aprobadas del empleado que se pisan con el rango. */
  findOverlapping(
    tenantId: string,
    employeeId: string,
    startDate: Date,
    endDate: Date,
    client: Client = this.prisma,
  ) {
    return client.leave.findFirst({
      where: {
        tenantId,
        employeeId,
        status: { in: ['PENDING', 'APPROVED'] },
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
      select: { id: true, startDate: true, endDate: true, status: true },
    });
  }

  create(data: Prisma.LeaveUncheckedCreateInput, client: Client = this.prisma) {
    return client.leave.create({ data, include: WITH_PEOPLE });
  }

  /** Transición con el estado esperado como guarda: 0 si otro la cambió antes. */
  async transition(
    tenantId: string,
    id: string,
    from: LeaveStatus[],
    data: Prisma.LeaveUncheckedUpdateManyInput,
    client: Client = this.prisma,
  ): Promise<number> {
    const result = await client.leave.updateMany({
      where: { id, tenantId, status: { in: from } },
      data,
    });
    return result.count;
  }

  getBalance(
    tenantId: string,
    employeeId: string,
    year: number,
    client: Client = this.prisma,
  ) {
    return client.leaveBalance.findFirst({
      where: { tenantId, employeeId, year },
    });
  }

  createBalanceIfMissing(
    tenantId: string,
    employeeId: string,
    year: number,
    entitled: number,
    client: Client = this.prisma,
  ) {
    return client.leaveBalance.upsert({
      where: { employeeId_year: { employeeId, year } },
      create: { tenantId, employeeId, year, entitled },
      update: {},
    });
  }

  setEntitlement(
    tenantId: string,
    employeeId: string,
    year: number,
    entitled: number,
    client: Client = this.prisma,
  ) {
    return client.leaveBalance.upsert({
      where: { employeeId_year: { employeeId, year } },
      create: { tenantId, employeeId, year, entitled },
      update: { entitled },
    });
  }

  /** Suma (o resta, con negativos) días tomados y pendientes. */
  adjustBalance(
    tenantId: string,
    employeeId: string,
    year: number,
    delta: { taken?: number; pending?: number },
    client: Client = this.prisma,
  ) {
    return client.leaveBalance.updateMany({
      where: { tenantId, employeeId, year },
      data: {
        ...(delta.taken ? { taken: { increment: delta.taken } } : {}),
        ...(delta.pending ? { pending: { increment: delta.pending } } : {}),
      },
    });
  }
}
