import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * Lecturas de solo consulta para los reportes. Reportes no tiene datos
 * propios: agrega pedidos, productos y cuentas por cobrar de otros módulos.
 */
@Injectable()
export class ReportsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findSaleOrdersForReport(where: Prisma.SaleOrderWhereInput) {
    return this.prisma.saleOrder.findMany({
      where,
      include: {
        customer: { select: { firstName: true, lastName: true } },
        items: {
          include: { product: { select: { name: true, categoryId: true } } },
        },
      },
      orderBy: { orderDate: 'asc' },
    });
  }

  findProductsWithMovements(tenantId: string) {
    return this.prisma.product.findMany({
      where: { tenantId, deletedAt: null },
      include: {
        category: { select: { name: true } },
        brand: { select: { name: true } },
        stockMovements: { select: { type: true, quantity: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  findReceivablesForReport(tenantId: string) {
    return this.prisma.accountsReceivable.findMany({
      where: { tenantId },
      include: {
        invoice: {
          include: {
            saleOrder: {
              include: {
                customer: true,
                // Para crédito, AR.dueDate queda fijo en la fecha de la
                // primera cuota desde que se crea el préstamo y nunca se
                // actualiza — no sirve para saber si el cliente está al día.
                // Se recalcula en el servicio con la cuota real más próxima
                // sin pagar.
                loan: {
                  select: {
                    installments: {
                      select: { dueDate: true, status: true },
                      orderBy: { number: 'asc' },
                    },
                  },
                },
              },
            },
          },
        },
        paymentRecords: { select: { amount: true, paymentDate: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
