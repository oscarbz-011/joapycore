import {
  money,
  roundGuaranies,
  sumMoney,
  type MoneyValue,
} from '../../../common/money/money';
import { Inject, Injectable } from '@nestjs/common';
import {
  RECEIVABLES_REPORT_SOURCE,
  SALES_REPORT_SOURCE,
  STOCK_REPORT_SOURCE,
  type ReceivablesReportSource,
  type SalesReportSource,
  type StockReportSource,
} from '../../../common/contracts/report-sources.contract';
import { startOfBusinessDay } from '../../../common/utils/business-date.util';

@Injectable()
export class ReportsService {
  constructor(
    @Inject(SALES_REPORT_SOURCE) private readonly sales: SalesReportSource,
    @Inject(STOCK_REPORT_SOURCE) private readonly stock: StockReportSource,
    @Inject(RECEIVABLES_REPORT_SOURCE)
    private readonly receivables: ReceivablesReportSource,
  ) {}

  async salesReport(tenantId: string, dateFrom?: string, dateTo?: string) {
    const orders = await this.sales.closedOrders(tenantId, {
      from: dateFrom ? new Date(dateFrom) : undefined,
      to: dateTo ? new Date(dateTo) : undefined,
    });

    const itemsTotal = (items: { unitPrice: unknown; quantity: number }[]) =>
      sumMoney(
        items.map((i) => money(i.unitPrice as MoneyValue).mul(i.quantity)),
      );
    const revenue = sumMoney(orders.map((o) => itemsTotal(o.items)));
    const totalRevenue = revenue.toNumber();

    // Group by month
    const byMonth = new Map<string, { revenue: number; orders: number }>();
    for (const order of orders) {
      const key = order.orderDate.toISOString().slice(0, 7);
      const entry = byMonth.get(key) ?? { revenue: 0, orders: 0 };
      entry.revenue = money(entry.revenue)
        .plus(itemsTotal(order.items))
        .toNumber();
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
        e.revenue = money(e.revenue)
          .plus(money(item.unitPrice).mul(item.quantity))
          .toNumber();
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
        avgOrderValue: orders.length
          ? roundGuaranies(revenue.div(orders.length)).toNumber()
          : 0,
        invoicedCount: orders.filter((o) => o.status === 'INVOICED').length,
        confirmedCount: orders.filter((o) => o.status === 'CONFIRMED').length,
      },
      byMonth: [...byMonth.entries()].map(([month, v]) => ({ month, ...v })),
      topProducts,
    };
  }

  async stockReport(tenantId: string) {
    const products = await this.stock.productsWithMovements(tenantId);

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
        // Un producto en DRAFT puede no tener precio todavía (null): para el
        // reporte se computa como 0 para no romper los totales, pero no es lo
        // mismo que un precio real de cero — por eso va el status al lado.
        costPrice: Number(p.costPrice ?? 0),
        salePrice: Number(p.salePrice ?? 0),
        stockValue: money(p.costPrice).mul(stock).toNumber(),
        status: p.status,
      };
    });

    const totalStockValue = sumMoney(items.map((i) => i.stockValue)).toNumber();
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
    const ars = await this.receivables.receivables(tenantId);

    // Vencimientos = días de calendario: se comparan contra el día de hoy en
    // Paraguay, no contra el instante actual.
    const today = startOfBusinessDay();
    const DUE_SOON_DAYS = 5;
    // AccountsReceivable solo existe para facturas de venta (invoiceType
    // SALE) — las de intereses moratorios se crean ya PAID, sin AR — así que
    // este filtro nunca debería descartar nada en la práctica, es puramente
    // defensivo ante el nuevo saleOrder opcional.
    const items = ars
      .filter((ar) => ar.invoice.saleOrder != null)
      .map((ar) => {
        // Ya filtrado arriba — solo llegan acá AR de facturas de venta.
        const saleOrder = ar.invoice.saleOrder!;
        const isCredit = saleOrder.saleType === 'CREDIT';
        let dueDate = ar.dueDate;
        let isOverdue = ar.dueDate
          ? ar.dueDate < today && ar.status !== 'PAID'
          : false;
        let isDueSoon = false;

        if (isCredit && ar.status !== 'PAID' && ar.status !== 'CANCELLED') {
          const nextUnpaid = saleOrder.loan?.installments.find(
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
              nextUnpaid.status === 'OVERDUE' || nextUnpaid.dueDate < today;
            if (!isOverdue) {
              const daysUntil = Math.ceil(
                (nextUnpaid.dueDate.getTime() - today.getTime()) / 86_400_000,
              );
              isDueSoon = daysUntil >= 0 && daysUntil <= DUE_SOON_DAYS;
            }
          } else {
            isOverdue = false;
          }
        }

        return {
          id: ar.id,
          customer: `${saleOrder.customer.firstName} ${saleOrder.customer.lastName}`,
          amount: Number(ar.amount),
          paidAmount: Number(ar.paidAmount),
          pending: money(ar.amount).minus(money(ar.paidAmount)).toNumber(),
          status: ar.status,
          saleType: saleOrder.saleType,
          dueDate,
          isOverdue,
          isDueSoon,
        };
      });

    const totalPending = sumMoney(items.map((i) => i.pending)).toNumber();
    const totalOverdue = sumMoney(
      items.filter((i) => i.isOverdue).map((i) => i.pending),
    ).toNumber();
    const totalCollected = sumMoney(items.map((i) => i.paidAmount)).toNumber();

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
