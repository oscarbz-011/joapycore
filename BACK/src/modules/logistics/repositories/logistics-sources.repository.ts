import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * Datos de otros módulos (empleados de RRHH, clientes, pedidos) que Logística
 * lee o actualiza. Quedan agrupados acá para que los servicios no consulten
 * Prisma directo y el acoplamiento de datos sea visible en un solo lugar.
 */
@Injectable()
export class LogisticsSourcesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findCouriers(tenantId: string) {
    return this.prisma.employee.findMany({
      where: { tenantId, isActive: true, deletedAt: null, isCourier: true },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        contractType: true,
        userId: true,
        phone: true,
        mobilePhone: true,
      },
      orderBy: { firstName: 'asc' },
    });
  }

  findActiveEmployee(tenantId: string, employeeId: string) {
    return this.prisma.employee.findFirst({
      where: { id: employeeId, tenantId, isActive: true },
      select: { id: true, firstName: true, lastName: true },
    });
  }

  // userId es único en employees; un empleado de otro tenant cuenta como
  // inexistente.
  async findEmployeeByUser(tenantId: string, userId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { userId },
    });
    return employee?.tenantId === tenantId ? employee : null;
  }

  updateCustomerLocation(
    tenantId: string,
    customerId: string,
    latitude: number,
    longitude: number,
  ) {
    return this.prisma.customer.updateMany({
      where: { id: customerId, tenantId },
      data: { latitude, longitude },
    });
  }

  // Backfill de arranque: recorre todos los tenants a propósito.
  findConfirmedOrdersWithoutDeliveryNote() {
    return this.prisma.saleOrder.findMany({
      where: {
        status: { in: ['CONFIRMED', 'INVOICED'] },
        deliveryNote: null,
      },
      select: { id: true, tenantId: true },
    });
  }
}
