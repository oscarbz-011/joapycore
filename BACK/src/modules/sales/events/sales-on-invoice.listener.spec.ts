import { SaleOrdersRepository } from '../repositories/sale-orders.repository';
import { SalesOnInvoiceListener } from './sales-on-invoice.listener';

describe('SalesOnInvoiceListener', () => {
  let prisma: { saleOrder: { updateMany: jest.Mock } };
  let listener: SalesOnInvoiceListener;

  beforeEach(() => {
    prisma = { saleOrder: { updateMany: jest.fn().mockResolvedValue({}) } };
    listener = new SalesOnInvoiceListener(
      new SaleOrdersRepository(prisma as any),
    );
  });

  it('pasa a INVOICED solo un pedido CONFIRMED del mismo tenant', async () => {
    await listener.handle({
      tenantId: 'tenant-1',
      invoiceId: 'inv-1',
      saleOrderId: 'order-1',
    });

    expect(prisma.saleOrder.updateMany).toHaveBeenCalledWith({
      where: { id: 'order-1', tenantId: 'tenant-1', status: 'CONFIRMED' },
      data: { status: 'INVOICED' },
    });
  });

  it('ignora facturas sin pedido (intereses moratorios)', async () => {
    await listener.handle({
      tenantId: 'tenant-1',
      invoiceId: 'inv-1',
      saleOrderId: '',
    });

    expect(prisma.saleOrder.updateMany).not.toHaveBeenCalled();
  });
});
