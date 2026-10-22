import { Injectable } from '@nestjs/common';
import { SaleOrderStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

export const AWAITING_DELIVERY: SaleOrderStatus[] = [
  'CONFIRMED',
  'PAYMENT_RECEIVED',
  'INVOICED',
];

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

  /** Un empleado activo habilitado como repartidor. */
  findActiveCourier(tenantId: string, employeeId: string) {
    return this.prisma.employee.findFirst({
      where: {
        id: employeeId,
        tenantId,
        isActive: true,
        deletedAt: null,
        isCourier: true,
      },
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

  async findOrderStatus(tenantId: string, saleOrderId: string) {
    const order = await this.prisma.saleOrder.findFirst({
      where: { id: saleOrderId, tenantId },
      select: { status: true },
    });
    return order?.status ?? null;
  }

  /** Sin `tenantId`, de todos los tenants que tienen Logística activa. */
  findConfirmedOrdersWithoutDeliveryNote(tenantId?: string) {
    return this.prisma.saleOrder.findMany({
      where: {
        ...(tenantId && { tenantId }),
        status: { in: AWAITING_DELIVERY },
        deliveryNote: null,
        tenant: {
          tenantModules: { some: { moduleName: 'logistics', active: true } },
        },
      },
      select: { id: true, tenantId: true },
    });
  }
}
