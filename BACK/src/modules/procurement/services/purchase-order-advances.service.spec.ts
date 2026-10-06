import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PurchaseOrderAdvancesService } from './purchase-order-advances.service';

function makeOrder(overrides = {}) {
  return {
    id: 'po-1',
    status: 'PENDING',
    advanceAmount: 300_000,
    // Total de la orden: 10 × 100.000 = 1.000.000
    items: [{ quantity: 10, unitCost: 100_000 }],
    ...overrides,
  };
}

const payment = {
  amount: 300_000,
  paymentMethod: 'BANK_TRANSFER' as const,
  paymentDate: '2026-10-07',
  reference: 'TRF-123',
};

describe('PurchaseOrderAdvancesService', () => {
  let service: PurchaseOrderAdvancesService;
  let orders: {
    findForAdvance: jest.Mock;
    lockForAdvance: jest.Mock;
    advanceMovements: jest.Mock;
    advanceApplied: jest.Mock;
    setAdvanceAmount: jest.Mock;
  };
  let payments: { create: jest.Mock };
  let eventEmitter: { emit: jest.Mock };
  const tx = { tx: true };

  beforeEach(() => {
    orders = {
      findForAdvance: jest.fn().mockResolvedValue(makeOrder()),
      lockForAdvance: jest.fn(),
      advanceMovements: jest.fn().mockResolvedValue([]),
      advanceApplied: jest.fn().mockResolvedValue(0),
      setAdvanceAmount: jest.fn(),
    };
    payments = { create: jest.fn() };
    eventEmitter = { emit: jest.fn() };
    service = new PurchaseOrderAdvancesService(
      { $transaction: jest.fn((cb) => cb(tx)) } as never,
      orders as never,
      payments as never,
      eventEmitter as never,
    );
  });

  describe('balance', () => {
    it('reports what was asked, paid and is still pending', async () => {
      orders.advanceMovements.mockResolvedValue([
        { kind: 'ADVANCE', amount: 100_000 },
      ]);

      await expect(service.balance('tenant-1', 'po-1')).resolves.toEqual({
        orderTotal: 1_000_000,
        required: 300_000,
        paid: 100_000,
        refunded: 0,
        applied: 0,
        available: 100_000,
        pending: 200_000,
      });
      expect(orders.findForAdvance).toHaveBeenCalledWith(
        'tenant-1',
        'po-1',
        undefined,
      );
    });

    it('does not reveal an order of another tenant', async () => {
      orders.findForAdvance.mockResolvedValue(null);

      await expect(service.balance('tenant-2', 'po-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('registerPayment', () => {
    it('records the advance against the order, before any receipt', async () => {
      await service.registerPayment('tenant-1', 'po-1', payment, 'user-1');

      expect(orders.lockForAdvance).toHaveBeenCalledWith(
        'tenant-1',
        'po-1',
        tx,
      );
      expect(payments.create).toHaveBeenCalledWith(
        {
          tenantId: 'tenant-1',
          purchaseOrderId: 'po-1',
          kind: 'ADVANCE',
          amount: 300_000,
          paymentMethod: 'BANK_TRANSFER',
          paymentDate: new Date('2026-10-07'),
          reference: 'TRF-123',
          notes: undefined,
          createdById: 'user-1',
        },
        tx,
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'audit.log',
        expect.objectContaining({
          action: 'purchase.order.advance.paid',
          resourceId: 'po-1',
        }),
      );
    });

    // El proveedor puede pedir el total; más que el total no es un anticipo.
    it('accepts paying the whole order up front but not more', async () => {
      await service.registerPayment(
        'tenant-1',
        'po-1',
        { ...payment, amount: 1_000_000 },
        'user-1',
      );
      expect(payments.create).toHaveBeenCalledTimes(1);

      await expect(
        service.registerPayment(
          'tenant-1',
          'po-1',
          { ...payment, amount: 1_000_001 },
          'user-1',
        ),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(payments.create).toHaveBeenCalledTimes(1);
    });

    it('counts what was already paid, net of refunds', async () => {
      orders.advanceMovements.mockResolvedValue([
        { kind: 'ADVANCE', amount: 900_000 },
        { kind: 'ADVANCE_REFUND', amount: 100_000 },
      ]);

      await service.registerPayment(
        'tenant-1',
        'po-1',
        { ...payment, amount: 200_000 },
        'user-1',
      );
      await expect(
        service.registerPayment(
          'tenant-1',
          'po-1',
          { ...payment, amount: 200_001 },
          'user-1',
        ),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it.each(['CANCELLED', 'RECEIVED'])(
      'takes no advance for an order that is %s',
      async (status) => {
        orders.findForAdvance.mockResolvedValue(makeOrder({ status }));

        await expect(
          service.registerPayment('tenant-1', 'po-1', payment, 'user-1'),
        ).rejects.toBeInstanceOf(UnprocessableEntityException);
        expect(payments.create).not.toHaveBeenCalled();
      },
    );
  });

  describe('registerRefund', () => {
    beforeEach(() => {
      orders.advanceMovements.mockResolvedValue([
        { kind: 'ADVANCE', amount: 300_000 },
      ]);
    });

    it('records what the supplier gave back', async () => {
      await service.registerRefund('tenant-1', 'po-1', payment, 'user-1');

      expect(payments.create).toHaveBeenCalledWith(
        expect.objectContaining({
          purchaseOrderId: 'po-1',
          kind: 'ADVANCE_REFUND',
          amount: 300_000,
        }),
        tx,
      );
    });

    // Lo ya aplicado a mercadería recibida no es plata que el proveedor deba.
    it('cannot refund more than the balance still in favour', async () => {
      orders.advanceApplied.mockResolvedValue(250_000);

      await expect(
        service.registerRefund('tenant-1', 'po-1', payment, 'user-1'),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(payments.create).not.toHaveBeenCalled();
    });
  });

  describe('setRequired', () => {
    it('changes what this order asks for in advance', async () => {
      await service.setRequired('tenant-1', 'po-1', 500_000, 'user-1');

      expect(orders.setAdvanceAmount).toHaveBeenCalledWith(
        'tenant-1',
        'po-1',
        500_000,
      );
    });

    it('accepts none and the whole order, nothing outside that', async () => {
      await service.setRequired('tenant-1', 'po-1', 0, 'user-1');
      await service.setRequired('tenant-1', 'po-1', 1_000_000, 'user-1');
      await expect(
        service.setRequired('tenant-1', 'po-1', 1_000_001, 'user-1'),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(orders.setAdvanceAmount).toHaveBeenCalledTimes(2);
    });

    it('does not change a cancelled order', async () => {
      orders.findForAdvance.mockResolvedValue(
        makeOrder({ status: 'CANCELLED' }),
      );

      await expect(
        service.setRequired('tenant-1', 'po-1', 100, 'user-1'),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });
});
