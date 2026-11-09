import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaClientOrTx } from '../../../prisma/types';

/**
 * Lecturas de datos de otros módulos (pedido, préstamo, recibo, sucursal)
 * que Facturación necesita para armar sus facturas. Quedan agrupadas acá
 * para que ningún listener/servicio consulte Prisma directo y para que el
 * acoplamiento de datos entre módulos sea visible en un solo lugar.
 */
@Injectable()
export class BillingSourcesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findSaleOrderForInvoicing(
    tenantId: string,
    saleOrderId: string,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.saleOrder.findFirst({
      where: { id: saleOrderId, tenantId },
      select: {
        saleType: true,
        items: {
          select: {
            id: true,
            quantity: true,
            unitPrice: true,
            financedUnitPrice: true,
            description: true,
            product: { select: { name: true, ivaTaxRate: true } },
          },
        },
      },
    });
  }

  findLoanTotalBySaleOrder(tenantId: string, saleOrderId: string) {
    return this.prisma.loan.findFirst({
      where: { saleOrderId, tenantId },
      select: { totalAmount: true },
    });
  }

  findReceiptForInterestInvoice(tenantId: string, receiptId: string) {
    return this.prisma.paymentReceipt.findFirst({
      where: { id: receiptId, tenantId },
      include: {
        items: true,
        loan: {
          include: {
            saleOrder: { include: { invoice: true } },
          },
        },
      },
    });
  }

  findBranch(
    tenantId: string,
    branchId: string,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.branch.findFirst({
      where: { id: branchId, tenantId },
      select: { id: true, name: true },
    });
  }

  // Depósitos entre los que se traslada mercadería con nota de remisión, con
  // la dirección de su sucursal para el punto de partida y de llegada.
  findWarehousesForRemission(
    tenantId: string,
    ids: string[] | null,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.warehouse.findMany({
      where: { tenantId, ...(ids ? { id: { in: ids } } : { isActive: true }) },
      select: {
        id: true,
        name: true,
        isActive: true,
        address: true,
        branch: {
          select: {
            id: true,
            name: true,
            address: true,
            numeroCasa: true,
            city: true,
            ciudadDesc: true,
            departamentoDesc: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  findBranchForRemission(
    tenantId: string,
    branchId: string,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.branch.findFirst({
      where: { id: branchId, tenantId },
      select: {
        id: true,
        name: true,
        address: true,
        numeroCasa: true,
        city: true,
        ciudadDesc: true,
        departamentoDesc: true,
      },
    });
  }

  findProductsForRemission(
    tenantId: string,
    ids: string[],
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.product.findMany({
      where: { tenantId, id: { in: ids }, deletedAt: null },
      select: {
        id: true,
        name: true,
        model: true,
        unit: true,
        isSerialized: true,
        brand: { select: { name: true } },
      },
    });
  }

  findSaleItemsForRemission(
    tenantId: string,
    saleItemIds: string[],
    client: PrismaClientOrTx = this.prisma,
  ) {
    if (saleItemIds.length === 0) return Promise.resolve([]);
    return client.saleOrderItem.findMany({
      where: { id: { in: saleItemIds }, saleOrder: { tenantId } },
      select: {
        id: true,
        productId: true,
        product: {
          select: {
            name: true,
            model: true,
            unit: true,
            isSerialized: true,
            brand: { select: { name: true } },
          },
        },
      },
    });
  }

  // N/S asignados a cada línea de venta, se hayan entregado o no todavía.
  async findSerialsBySaleItems(
    tenantId: string,
    saleItemIds: string[],
    client: PrismaClientOrTx = this.prisma,
  ): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>();
    if (saleItemIds.length === 0) return result;
    const units = await client.productUnit.findMany({
      where: {
        tenantId,
        saleOrderItemId: { in: saleItemIds },
        status: { in: ['IN_STOCK', 'SOLD'] },
      },
      select: { saleOrderItemId: true, serialNumber: true },
      orderBy: { serialNumber: 'asc' },
    });
    for (const unit of units) {
      if (!unit.saleOrderItemId) continue;
      const list = result.get(unit.saleOrderItemId) ?? [];
      list.push(unit.serialNumber);
      result.set(unit.saleOrderItemId, list);
    }
    return result;
  }

  // La empresa: destinataria de un traslado entre sus sucursales y
  // transportista cuando el vehículo es propio.
  findTenantForRemission(
    tenantId: string,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.tenant.findUnique({
      where: { id: tenantId },
      select: {
        name: true,
        razonSocial: true,
        ruc: true,
        address: true,
        numeroCasa: true,
        city: true,
        departamentoDesc: true,
      },
    });
  }
}
