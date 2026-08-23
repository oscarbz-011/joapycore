import { Injectable } from '@nestjs/common';
import { SaleOrderStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async salesReport(tenantId: string, dateFrom?: string, dateTo?: string) {
    const where = {
      tenantId,
      status: { in: [SaleOrderStatus.CONFIRMED, SaleOrderStatus.INVOICED] },
      ...(dateFrom || dateTo
        ? {
            orderDate: {
              ...(dateFrom && { gte: new Date(dateFrom) }),
              ...(dateTo && { lte: new Date(dateTo) }),
            },
          }
        : {}),
    };

    const orders = await this.prisma.saleOrder.findMany({
      where,
      include: {
        customer: { select: { firstName: true, lastName: true } },
        items: {
          include: { product: { select: { name: true, categoryId: true } } },
        },
      },
      orderBy: { orderDate: 'asc' },
    });

    const totalRevenue = orders.reduce(
      (acc, o) =>
        acc + o.items.reduce((s, i) => s + Number(i.unitPrice) * i.quantity, 0),
      0,
    );

    // Group by month
    const byMonth = new Map<string, { revenue: number; orders: number }>();
    for (const order of orders) {
      const key = order.orderDate.toISOString().slice(0, 7);
      const entry = byMonth.get(key) ?? { revenue: 0, orders: 0 };
      entry.revenue += order.items.reduce(
        (s, i) => s + Number(i.unitPrice) * i.quantity,
        0,
      );
      entry.orders += 1;
      byMonth.set(key, entry);
    }

    // Top products by revenue
    const productMap = new Map<
      string,
      { name: string; quantity: number; revenue: number }
    >();
    for (const order of orders) {
      for (const item of order.items) {
        if (!item.productId || !item.product) continue; // skip free-text service lines
        const e = productMap.get(item.productId) ?? {
          name: item.product.name,
          quantity: 0,
          revenue: 0,
        };
        e.quantity += item.quantity;
        e.revenue += Number(item.unitPrice) * item.quantity;
        productMap.set(item.productId, e);
      }
    }
    const topProducts = [...productMap.values()]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    return {
      summary: {
        totalRevenue,
        ordersCount: orders.length,
        avgOrderValue: orders.length ? totalRevenue / orders.length : 0,
        invoicedCount: orders.filter((o) => o.status === 'INVOICED').length,
        confirmedCount: orders.filter((o) => o.status === 'CONFIRMED').length,
      },
      byMonth: [...byMonth.entries()].map(([month, v]) => ({ month, ...v })),
      topProducts,
    };
  }

  async stockReport(tenantId: string) {
    const products = await this.prisma.product.findMany({
      where: { tenantId, deletedAt: null },
      include: {
        category: { select: { name: true } },
        brand: { select: { name: true } },
        stockMovements: { select: { type: true, quantity: true } },
      },
      orderBy: { name: 'asc' },
    });

    const items = products.map((p) => {
      const stock = p.stockMovements.reduce((acc, m) => {
        if (m.type === 'IN' || m.type === 'ADJUSTMENT') return acc + m.quantity;
        if (m.type === 'OUT') return acc - m.quantity;
        return acc;
      }, 0);
      return {
        id: p.id,
        name: p.name,
        model: p.model,
        category: p.category?.name ?? '',
        brand: p.brand?.name ?? '',
        isSerialized: p.isSerialized,
        stock,
        costPrice: Number(p.costPrice),
        salePrice: Number(p.salePrice),
        stockValue: stock * Number(p.costPrice),
        isActive: p.isActive,
      };
    });

    const totalStockValue = items.reduce((s, i) => s + i.stockValue, 0);
    const lowStock = items.filter(
      (i) => !i.isSerialized && i.stock > 0 && i.stock <= 5,
    ).length;
    const outOfStock = items.filter(
      (i) => !i.isSerialized && i.stock <= 0,
    ).length;

    return {
      summary: {
        totalProducts: items.length,
        totalStockValue,
        lowStock,
        outOfStock,
      },
      products: items,
    };
  }

  async receivablesReport(tenantId: string) {
    const ars = await this.prisma.accountsReceivable.findMany({
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
                // Se recalcula acá con la cuota real más próxima sin pagar.
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

    const now = new Date();
    const DUE_SOON_DAYS = 5;
    const items = ars.map((ar) => {
      const isCredit = ar.invoice.saleOrder.saleType === 'CREDIT';
      let dueDate = ar.dueDate;
      let isOverdue = ar.dueDate ? ar.dueDate < now && ar.status !== 'PAID' : false;
      let isDueSoon = false;

      if (isCredit && ar.status !== 'PAID' && ar.status !== 'CANCELLED') {
        const nextUnpaid = ar.invoice.saleOrder.loan?.installments.find(
          (i) => i.status !== 'PAID',
        );
        if (nextUnpaid) {
          dueDate = nextUnpaid.dueDate;
          // No alcanza con status === 'OVERDUE' solo — ese campo lo pone el
          // cron nocturno (installments-scheduler.service.ts), así que una
          // cuota recién vencida (o cualquier corrida antes de medianoche)
          // seguiría en PENDING. Se respalda con la fecha directamente para
          // que la detección sea tan inmediata como siempre fue.
          isOverdue =
            nextUnpaid.status === 'OVERDUE' || nextUnpaid.dueDate < now;
          if (!isOverdue) {
            const daysUntil = Math.ceil(
              (nextUnpaid.dueDate.getTime() - now.getTime()) / 86_400_000,
            );
            isDueSoon = daysUntil >= 0 && daysUntil <= DUE_SOON_DAYS;
          }
        } else {
          isOverdue = false;
        }
      }

      return {
        id: ar.id,
        customer: `${ar.invoice.saleOrder.customer.firstName} ${ar.invoice.saleOrder.customer.lastName}`,
        amount: Number(ar.amount),
        paidAmount: Number(ar.paidAmount),
        pending: Number(ar.amount) - Number(ar.paidAmount),
        status: ar.status,
        saleType: ar.invoice.saleOrder.saleType,
        dueDate,
        isOverdue,
        isDueSoon,
      };
    });

    const totalPending = items.reduce((s, i) => s + i.pending, 0);
    const totalOverdue = items
      .filter((i) => i.isOverdue)
      .reduce((s, i) => s + i.pending, 0);
    const totalCollected = items.reduce((s, i) => s + i.paidAmount, 0);

    return {
      summary: {
        totalPending,
        totalOverdue,
        totalCollected,
        totalItems: items.length,
      },
      items,
    };
  }
}
