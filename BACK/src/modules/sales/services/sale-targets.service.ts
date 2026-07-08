import { Injectable } from '@nestjs/common';
import { SaleTargetsRepository } from '../repositories/sale-targets.repository';

interface SellerInfo {
  id: string;
  firstName: string;
  lastName: string;
}

interface SellerEntry {
  seller: SellerInfo;
  actual: number;
  cashAmount: number;
  creditAmount: number;
  cashCount: number;
  creditCount: number;
}

@Injectable()
export class SaleTargetsService {
  constructor(private readonly repo: SaleTargetsRepository) {}

  async getPerformance(
    tenantId: string,
    period: string,
    requestingUserId?: string,
    canManage = false,
  ) {
    const [year, month] = period.split('-').map(Number);
    const from = new Date(Date.UTC(year, month - 1, 1));
    const to   = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

    const [targets, orders] = await Promise.all([
      this.repo.findForPeriod(tenantId, period),
      this.repo.getOrdersForPeriod(tenantId, from, to),
    ]);

    // Aggregate actual sales per effective seller (sellerId ?? createdById)
    const sellerActuals = new Map<string, SellerEntry>();

    for (const order of orders) {
      const effectiveSellerId = order.sellerId ?? order.createdById;
      const effectiveSeller   = order.seller   ?? order.createdBy;
      if (!effectiveSellerId || !effectiveSeller) continue;

      const orderTotal = order.items.reduce(
        (sum, item) => sum + item.quantity * Number(item.unitPrice),
        0,
      );
      const isCash = order.saleType === 'CASH';

      const entry = sellerActuals.get(effectiveSellerId);
      if (entry) {
        entry.actual += orderTotal;
        if (isCash) { entry.cashAmount += orderTotal; entry.cashCount++; }
        else        { entry.creditAmount += orderTotal; entry.creditCount++; }
      } else {
        sellerActuals.set(effectiveSellerId, {
          seller: { id: effectiveSeller.id, firstName: effectiveSeller.firstName, lastName: effectiveSeller.lastName },
          actual: orderTotal,
          cashAmount:   isCash ? orderTotal : 0,
          creditAmount: isCash ? 0 : orderTotal,
          cashCount:    isCash ? 1 : 0,
          creditCount:  isCash ? 0 : 1,
        });
      }
    }

    const companyTargetRow = targets.find((t) => t.userId === null);
    const companyActual    = [...sellerActuals.values()].reduce((s, v) => s + v.actual, 0);

    const sellerTargetMap = new Map(
      targets.filter((t) => t.userId !== null).map((t) => [t.userId!, t]),
    );

    const allSellerIds = new Set([...sellerActuals.keys(), ...sellerTargetMap.keys()]);

    // Non-managers only see their own stat
    const visibleIds = canManage
      ? [...allSellerIds]
      : [...allSellerIds].filter((id) => id === requestingUserId);

    const sellers = visibleIds
      .map((userId) => {
        const actualEntry = sellerActuals.get(userId);
        const targetRow   = sellerTargetMap.get(userId);
        const seller: SellerInfo =
          actualEntry?.seller ?? (targetRow?.user as SellerInfo);
        return {
          seller: { id: seller.id, firstName: seller.firstName, lastName: seller.lastName },
          actual:       actualEntry?.actual       ?? 0,
          cashAmount:   actualEntry?.cashAmount   ?? 0,
          creditAmount: actualEntry?.creditAmount ?? 0,
          cashCount:    actualEntry?.cashCount    ?? 0,
          creditCount:  actualEntry?.creditCount  ?? 0,
          target: targetRow ? Number(targetRow.targetAmount) : null,
        };
      })
      .sort((a, b) => b.actual - a.actual);

    return {
      period,
      companyActual,
      companyTarget: companyTargetRow ? Number(companyTargetRow.targetAmount) : null,
      sellers,
      canManage,
    };
  }

  setCompanyTarget(tenantId: string, period: string, targetAmount: number) {
    return this.repo.upsertTarget(tenantId, period, null, targetAmount);
  }

  setSellerTarget(tenantId: string, userId: string, period: string, targetAmount: number) {
    return this.repo.upsertTarget(tenantId, period, userId, targetAmount);
  }

  removeSellerTarget(tenantId: string, userId: string, period: string) {
    return this.repo.deleteTarget(tenantId, period, userId);
  }

  removeCompanyTarget(tenantId: string, period: string) {
    return this.repo.deleteTarget(tenantId, period, null);
  }
}
