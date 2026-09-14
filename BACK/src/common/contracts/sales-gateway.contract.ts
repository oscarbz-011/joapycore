import type { PaymentMethod } from '@prisma/client';
import type { SaleOrderItemDto } from './sale-order-item.dto';

export interface QuickSaleInput {
  customerId?: string;
  items: SaleOrderItemDto[];
  payments: Array<{
    amount: number;
    paymentMethod: PaymentMethod;
    reference?: string;
  }>;
}

/**
 * Creación de ventas de mostrador para POS. La implementa Ventas y se inyecta
 * por token: POS no importa SalesModule ni SaleOrdersService.
 */
export const SALES_GATEWAY = Symbol('SALES_GATEWAY');

export interface SalesGateway {
  createPosSale(
    tenantId: string,
    input: QuickSaleInput,
    posSessionId: string,
    userId: string,
  ): Promise<{ id: string }>;
}
