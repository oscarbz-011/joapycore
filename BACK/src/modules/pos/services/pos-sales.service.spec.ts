import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PosSalesService } from './pos-sales.service';

const tx = { marker: 'tx' };

const FISCAL = {
  invoiceId: 'inv-1',
  modality: 'SELF_PRINTED',
  number: '001-002-0000041',
  timbrado: '12345678',
  timbradoValidFrom: new Date('2026-01-01T00:00:00.000Z'),
  timbradoValidUntil: new Date('2026-12-31T00:00:00.000Z'),
  issuedAt: new Date('2026-06-15T15:00:00.000Z'),
  condition: 'CONTADO',
  issuer: { name: 'Mi Empresa S.A.' },
  buyer: { name: 'Sin Nombre', document: 'X' },
  lines: [],
  totals: {
    exempt: 0,
    taxed5: 0,
    taxed10: 220_000,
    iva5: 0,
    iva10: 20_000,
    ivaTotal: 20_000,
    total: 220_000,
  },
};

function makeSession(terminal: Record<string, unknown> = {}) {
  return {
    id: 'session-1',
    terminal: {
      id: 'terminal-1',
      name: 'Caja 1',
      branchId: 'branch-1',
      invoiceSeriesId: 'series-1',
      printFormat: 'THERMAL_80',
      thermalPaperConservation: 'Conservar lejos del calor',
      ...terminal,
    },
  };
}

const dto = {
  items: [{ productId: 'prod-1', quantity: 2, unitPrice: 110_000 }],
  payments: [
    { amount: 50_000, paymentMethod: 'CARD' as const },
    { amount: 200_000, paymentMethod: 'CASH' as const },
  ],
};

describe('PosSalesService', () => {
  let salesGateway: { createPosSaleInTransaction: jest.Mock };
  let billing: {
    issuePosInvoice: jest.Mock;
    requestPdf: jest.Mock;
    findReceiptBySaleOrder: jest.Mock;
  };
  let prisma: { $transaction: jest.Mock };
  let outbox: { dispatch: jest.Mock };
  let sessions: { findActiveByCashier: jest.Mock };
  let sales: { findForReceipt: jest.Mock };
  let eventEmitter: { emit: jest.Mock };
  let service: PosSalesService;
  const order: string[] = [];

  beforeEach(() => {
    order.length = 0;
    salesGateway = {
      createPosSaleInTransaction: jest.fn().mockImplementation(() => {
        order.push('sale');
        return Promise.resolve({ id: 'order-1', eventIds: ['sale-event'] });
      }),
    };
    billing = {
      issuePosInvoice: jest.fn().mockImplementation(() => {
        order.push('invoice');
        return Promise.resolve({
          invoiceId: 'inv-1',
          eventId: 'invoice-event',
        });
      }),
      requestPdf: jest.fn(),
      findReceiptBySaleOrder: jest.fn().mockResolvedValue(FISCAL),
    };
    prisma = {
      $transaction: jest.fn().mockImplementation(async (cb) => {
        const result = await cb(tx);
        order.push('commit');
        return result;
      }),
    };
    outbox = {
      dispatch: jest.fn().mockImplementation((id: string) => {
        order.push(`dispatch:${id}`);
        return Promise.resolve(true);
      }),
    };
    sessions = {
      findActiveByCashier: jest.fn().mockResolvedValue(makeSession()),
    };
    sales = {
      findForReceipt: jest.fn().mockResolvedValue({
        id: 'order-1',
        salePayments: [
          { paymentMethod: 'CARD', amount: 50_000 },
          { paymentMethod: 'CASH', amount: 200_000 },
        ],
        posSession: {
          terminal: {
            name: 'Caja 1',
            printFormat: 'THERMAL_80',
            thermalPaperConservation: 'Conservar lejos del calor',
          },
          cashier: { firstName: 'Ana', lastName: 'Gómez' },
        },
      }),
    };
    eventEmitter = { emit: jest.fn() };
    service = new PosSalesService(
      salesGateway as any,
      billing as any,
      prisma as any,
      outbox as any,
      sessions as any,
      sales as any,
      eventEmitter as any,
    );
  });

  describe('create', () => {
    it('requires an open cash session', async () => {
      sessions.findActiveByCashier.mockResolvedValue(null);

      await expect(
        service.create('tenant-1', dto, 'cashier-1'),
      ).rejects.toThrow('No tenés una sesión de caja abierta');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('does not sell from a cash register without an invoice series', async () => {
      sessions.findActiveByCashier.mockResolvedValue(
        makeSession({ invoiceSeriesId: null }),
      );

      await expect(
        service.create('tenant-1', dto, 'cashier-1'),
      ).rejects.toThrow('La caja Caja 1 no tiene una serie de facturas');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('saves the sale and its invoice together and publishes after the commit', async () => {
      await service.create('tenant-1', dto, 'cashier-1');

      expect(salesGateway.createPosSaleInTransaction).toHaveBeenCalledWith(
        tx,
        'tenant-1',
        dto,
        'session-1',
        'cashier-1',
      );
      expect(billing.issuePosInvoice).toHaveBeenCalledWith(tx, 'tenant-1', {
        saleOrderId: 'order-1',
        branchId: 'branch-1',
        seriesId: 'series-1',
        documentNumber: undefined,
        anonymousBuyer: true,
        paymentMethod: 'CASH',
        issuedById: 'cashier-1',
        at: expect.any(Date),
      });
      expect(order).toEqual([
        'sale',
        'invoice',
        'commit',
        'dispatch:sale-event',
        'dispatch:invoice-event',
      ]);
      expect(billing.requestPdf).toHaveBeenCalledWith('tenant-1', 'inv-1');
    });

    it('invoices to the chosen customer and passes the talonario number', async () => {
      await service.create(
        'tenant-1',
        { ...dto, customerId: 'cust-1', documentNumber: 41 },
        'cashier-1',
      );

      expect(salesGateway.createPosSaleInTransaction).toHaveBeenCalledWith(
        tx,
        'tenant-1',
        expect.not.objectContaining({ documentNumber: 41 }),
        'session-1',
        'cashier-1',
      );
      expect(billing.issuePosInvoice).toHaveBeenCalledWith(
        tx,
        'tenant-1',
        expect.objectContaining({ anonymousBuyer: false, documentNumber: 41 }),
      );
    });

    it('returns what the cash register prints', async () => {
      const result = await service.create('tenant-1', dto, 'cashier-1');

      expect(result).toEqual({
        saleOrderId: 'order-1',
        receipt: expect.objectContaining({
          number: '001-002-0000041',
          copy: false,
          terminalName: 'Caja 1',
          cashierName: 'Ana Gómez',
          printFormat: 'THERMAL_80',
          paperConservation: 'Conservar lejos del calor',
          change: 30_000,
        }),
      });
    });

    it('reports a talonario number taken by another sale and publishes nothing', async () => {
      prisma.$transaction.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      await expect(
        service.create('tenant-1', { ...dto, documentNumber: 41 }, 'cashier-1'),
      ).rejects.toThrow('El número 41 del talonario ya fue usado');
      expect(outbox.dispatch).not.toHaveBeenCalled();
      expect(billing.requestPdf).not.toHaveBeenCalled();
    });

    it('rolls back the sale when the invoice cannot be numbered', async () => {
      billing.issuePosInvoice.mockRejectedValue(
        new UnprocessableEntityException('El timbrado venció el 31/12/2025'),
      );

      await expect(
        service.create('tenant-1', dto, 'cashier-1'),
      ).rejects.toThrow('El timbrado venció el 31/12/2025');
      expect(order).not.toContain('commit');
      expect(outbox.dispatch).not.toHaveBeenCalled();
    });
  });

  describe('receipt', () => {
    it('marks a reprint as a copy and audits it', async () => {
      const receipt = await service.receipt('tenant-1', 'order-1', {
        copy: true,
        userId: 'cashier-1',
      });

      expect(receipt.copy).toBe(true);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'audit.log',
        expect.objectContaining({
          action: 'pos.receipt.reprinted',
          resourceId: 'order-1',
          userId: 'cashier-1',
        }),
      );
    });

    it('does not find a sale of another tenant', async () => {
      sales.findForReceipt.mockResolvedValue(null);

      await expect(
        service.receipt('tenant-2', 'order-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(sales.findForReceipt).toHaveBeenCalledWith('tenant-2', 'order-1');
    });

    it('explains when the sale has no invoice', async () => {
      billing.findReceiptBySaleOrder.mockResolvedValue(null);

      await expect(service.receipt('tenant-1', 'order-1')).rejects.toThrow(
        'La venta no tiene factura emitida',
      );
    });
  });
});
