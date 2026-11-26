import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class PayrollRepository {
  constructor(private readonly prisma: PrismaService) {}

  getConfig(tenantId: string) {
    return this.prisma.payrollConfig.findUnique({ where: { tenantId } });
  }

  upsertConfig(
    tenantId: string,
    data: {
      minimumWage: number;
      ipsEmployeeRate: number;
      ipsEmployerRate: number;
    },
  ) {
    return this.prisma.payrollConfig.upsert({
      where: { tenantId },
      create: { tenantId, ...data },
      update: data,
    });
  }

  findRecords(tenantId: string) {
    return this.prisma.payrollRecord.findMany({
      where: { tenantId },
      orderBy: { period: 'desc' },
    });
  }

  sumItemsByRecord(tenantId: string, payrollRecordIds: string[]) {
    return this.prisma.payrollRecordItem.groupBy({
      by: ['payrollRecordId'],
      where: { tenantId, payrollRecordId: { in: payrollRecordIds } },
      _sum: {
        grossSalary: true,
        netSalary: true,
        ipsEmployee: true,
        ipsEmployer: true,
        aguinaldo: true,
      },
    });
  }

  findRecord(tenantId: string, id: string) {
    return this.prisma.payrollRecord.findFirst({
      where: { id, tenantId },
      include: {
        items: {
          include: {
            employee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                employeeNumber: true,
              },
            },
          },
        },
      },
    });
  }

  createRecord(data: Prisma.PayrollRecordUncheckedCreateInput) {
    return this.prisma.payrollRecord.create({ data });
  }

  updateRecord(
    tenantId: string,
    id: string,
    data: Prisma.PayrollRecordUncheckedUpdateInput,
  ) {
    return this.prisma.payrollRecord.updateMany({
      where: { id, tenantId },
      data,
    });
  }

  createItem(data: Prisma.PayrollRecordItemUncheckedCreateInput) {
    return this.prisma.payrollRecordItem.create({ data });
  }

  updateItem(id: string, data: Prisma.PayrollRecordItemUncheckedUpdateInput) {
    return this.prisma.payrollRecordItem.update({ where: { id }, data });
  }
}
