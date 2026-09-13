import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeAR(overrides = {}) {
  return {
    id: 'ar-1',
    tenantId: 'tenant-1',
    invoiceId: 'inv-1',
    amount: 2_500_000,
    paidAmount: 0,
    status: 'PENDING' as const,
    dueDate: null,
    invoice: {
      saleOrder: {
        customer: { firstName: 'María', lastName: 'González', email: null },
      },
    },
    paymentRecords: [],
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('PaymentsService', () => {
  let service: PaymentsService;
  let arRepository: {
    findAll: jest.Mock;
    findById: jest.Mock;
    create: jest.Mock;
    incrementPaid: jest.Mock;
    updateStatus: jest.Mock;
  };
  let paymentRecordsRepository: { create: jest.Mock };
  let eventEmitter: { emit: jest.Mock };
  let prisma: {
    $transaction: jest.Mock;
    paymentRecord: { findMany: jest.Mock };
    paymentReceipt: { findMany: jest.Mock };
  };

  beforeEach(() => {
    arRepository = {
      findAll: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      incrementPaid: jest.fn().mockResolvedValue(makeAR({ paidAmount: 0 })),
      updateStatus: jest.fn().mockResolvedValue(undefined),
    };
    paymentRecordsRepository = {
      create: jest.fn().mockResolvedValue({ id: 'pr-1' }),
    };
    eventEmitter = { emit: jest.fn() };

    const tx = {};
    prisma = {
      $transaction: jest.fn().mockImplementation((cb) => cb(tx)),
      paymentRecord: { findMany: jest.fn().mockResolvedValue([]) },
      paymentReceipt: { findMany: jest.fn().mockResolvedValue([]) },
    };

    service = new PaymentsService(
      prisma as any,
      arRepository as any,
      paymentRecordsRepository as any,
      eventEmitter as any,
    );
  });

  const baseDto = {
    amount: 1_000_000,
    paymentMethod: 'CASH' as const,
    paymentDate: '2026-06-21',
  };

  // ── findAll ────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('delegates to repository', async () => {
      arRepository.findAll.mockResolvedValue([makeAR()]);
      await service.findAll('tenant-1');
      expect(arRepository.findAll).toHaveBeenCalledWith('tenant-1');
    });
  });

  // ── getCollections ─────────────────────────────────────────────────────────

  describe('getCollections', () => {
    // Instante UTC explícito — no un `new Date(y,m,d,h,m)` local, que
    // dependería del timezone del sistema operativo de la máquina que
    // corre el test. 18:30 UTC = 15:30 en Asunción (UTC-3) del mismo día
    // calendario — miércoles, para que el lunes de esa semana sea un día
    // distinto al de "hoy" y así distinguir los tres rangos entre sí.
    const NOW = new Date(Date.UTC(2026, 8, 9, 18, 30));

    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(NOW);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    function paymentDateArg(): { gte: Date; lt: Date } {
      const calls = prisma.paymentRecord.findMany.mock.calls as [
        { where: { paymentDate: { gte: Date; lt: Date } } },
      ][];
      return calls[0][0].where.paymentDate;
    }

    function issuedAtArg(): { gte: Date; lt: Date } {
      const calls = prisma.paymentReceipt.findMany.mock.calls as [
        { where: { issuedAt: { gte: Date; lt: Date } } },
      ][];
      return calls[0][0].where.issuedAt;
    }

    it('defaults to the current calendar month', async () => {
      await service.getCollections('tenant-1');

      expect(paymentDateArg()).toEqual({
        gte: new Date(Date.UTC(2026, 8, 1)),
        lt: new Date(Date.UTC(2026, 9, 1)),
      });
    });

    it('"day" scopes to just today in Asunción (midnight to midnight)', async () => {
      await service.getCollections('tenant-1', 'day');

      const expected = {
        gte: new Date(Date.UTC(2026, 8, 9)),
        lt: new Date(Date.UTC(2026, 8, 10)),
      };
      expect(paymentDateArg()).toEqual(expected);
      expect(issuedAtArg()).toEqual(expected);
    });

    it('"week" scopes Monday through Sunday of the current week', async () => {
      await service.getCollections('tenant-1', 'week');

      // 2026-09-09 es miércoles en Asunción — el lunes de esa semana es 2026-09-07.
      expect(paymentDateArg()).toEqual({
        gte: new Date(Date.UTC(2026, 8, 7)),
        lt: new Date(Date.UTC(2026, 8, 14)),
      });
    });

    it('anchors "today" to Asunción, not the server OS timezone', async () => {
      // 02:30 UTC del 9 de septiembre = 23:30 del 8 de septiembre en
      // Asunción (UTC-3) — si el cálculo usara el reloj crudo del server
      // (o cualquier timezone con offset >= 0), "hoy" saldría 9 de
      // septiembre en vez del 8. Este es exactamente el caso que causaba
      // que pagos recién cargados de noche no aparecieran en "Hoy".
      jest.setSystemTime(new Date(Date.UTC(2026, 8, 9, 2, 30)));

      await service.getCollections('tenant-1', 'day');

      expect(paymentDateArg()).toEqual({
        gte: new Date(Date.UTC(2026, 8, 8)),
        lt: new Date(Date.UTC(2026, 8, 9)),
      });
    });

    it('aggregates cash payments and credit receipt collections by method', async () => {
      prisma.paymentRecord.findMany.mockResolvedValue([
        { amount: 100_000, paymentMethod: 'CASH' },
        { amount: 50_000, paymentMethod: 'BANK_TRANSFER' },
      ]);
      prisma.paymentReceipt.findMany.mockResolvedValue([
        { totalAmount: 200_000, paymentMethod: 'CASH' },
        { totalAmount: 30_000, paymentMethod: 'BANK_TRANSFER' },
      ]);

      const result = await service.getCollections('tenant-1', 'month');

      expect(result).toEqual({
        range: 'month',
        total: 380_000,
        cash: {
          total: 150_000,
          byMethod: { CASH: 100_000, BANK_TRANSFER: 50_000 },
        },
        credit: {
          total: 230_000,
          byMethod: { CASH: 200_000, BANK_TRANSFER: 30_000 },
        },
        byMethod: { CASH: 300_000, BANK_TRANSFER: 80_000 },
      });
    });

    it('counts a partial installment payment as a collection (uses PaymentReceipt, not Installment.paidAt)', async () => {
      // Bug real: Installment.paidAt solo se completa cuando la cuota queda
      // TOTALMENTE pagada — un abono parcial nunca lo toca, así que
      // consultar por ese campo hacía desaparecer cualquier cobro parcial de
      // "recaudación de hoy" para siempre, no solo por un desfasaje de
      // timezone. PaymentReceipt sí se crea en cada cobro, parcial o no.
      prisma.paymentReceipt.findMany.mockResolvedValue([
        { totalAmount: 75_000, paymentMethod: 'CASH' },
      ]);

      const result = await service.getCollections('tenant-1', 'day');

      expect(result.credit).toEqual({
        total: 75_000,
        byMethod: { CASH: 75_000 },
      });
    });
  });

  // ── findOne ────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns AR when found', async () => {
      arRepository.findById.mockResolvedValue(makeAR());
      const result = await service.findOne('tenant-1', 'ar-1');
      expect(result.id).toBe('ar-1');
    });

    it('throws NotFoundException when AR does not exist', async () => {
      arRepository.findById.mockResolvedValue(null);
      await expect(service.findOne('tenant-1', 'ghost')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // ── registerPayment ────────────────────────────────────────────────────────

  describe('registerPayment', () => {
    it('throws UnprocessableEntityException when AR is already PAID', async () => {
      arRepository.findById.mockResolvedValue(makeAR({ status: 'PAID' }));

      await expect(
        service.registerPayment('tenant-1', 'ar-1', baseDto),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);

      expect(paymentRecordsRepository.create).not.toHaveBeenCalled();
    });

    it('throws UnprocessableEntityException when AR is CANCELLED', async () => {
      arRepository.findById.mockResolvedValue(makeAR({ status: 'CANCELLED' }));

      await expect(
        service.registerPayment('tenant-1', 'ar-1', baseDto),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('throws UnprocessableEntityException when payment exceeds remaining balance', async () => {
      arRepository.findById.mockResolvedValue(
        makeAR({ amount: 1_000_000, paidAmount: 0 }),
      );

      await expect(
        service.registerPayment('tenant-1', 'ar-1', {
          ...baseDto,
          amount: 2_000_000,
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('creates payment and sets status to PARTIAL for partial payment', async () => {
      const updatedAR = makeAR({ paidAmount: 1_000_000, status: 'PARTIAL' });
      arRepository.incrementPaid.mockResolvedValue(
        makeAR({
          paidAmount: 1_000_000,
          amount: 2_500_000,
          invoiceId: 'inv-1',
        }),
      );
      arRepository.findById
        .mockResolvedValueOnce(makeAR({ amount: 2_500_000, paidAmount: 0 }))
        .mockResolvedValueOnce(updatedAR);

      const result = await service.registerPayment('tenant-1', 'ar-1', baseDto);

      expect(paymentRecordsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 1_000_000, paymentMethod: 'CASH' }),
        expect.anything(),
      );
      expect(arRepository.incrementPaid).toHaveBeenCalledWith(
        'ar-1',
        1_000_000,
        expect.anything(),
      );
      expect(arRepository.updateStatus).toHaveBeenCalledWith(
        'ar-1',
        'PARTIAL',
        expect.anything(),
      );
      expect(result?.status).toBe('PARTIAL');
    });

    it('creates payment and sets status to PAID when balance is cleared', async () => {
      const updatedAR = makeAR({ paidAmount: 2_500_000, status: 'PAID' });
      arRepository.incrementPaid.mockResolvedValue(
        makeAR({
          paidAmount: 2_500_000,
          amount: 2_500_000,
          invoiceId: 'inv-1',
        }),
      );
      arRepository.findById
        .mockResolvedValueOnce(makeAR({ amount: 2_500_000, paidAmount: 0 }))
        .mockResolvedValueOnce(updatedAR);

      await service.registerPayment('tenant-1', 'ar-1', {
        ...baseDto,
        amount: 2_500_000,
      });

      expect(arRepository.incrementPaid).toHaveBeenCalledWith(
        'ar-1',
        2_500_000,
        expect.anything(),
      );
      expect(arRepository.updateStatus).toHaveBeenCalledWith(
        'ar-1',
        'PAID',
        expect.anything(),
      );
    });

    it('emits payment.ar.completed when AR is fully paid', async () => {
      arRepository.incrementPaid.mockResolvedValue(
        makeAR({
          paidAmount: 2_500_000,
          amount: 2_500_000,
          invoiceId: 'inv-1',
        }),
      );
      arRepository.findById
        .mockResolvedValueOnce(makeAR({ amount: 2_500_000, paidAmount: 0 }))
        .mockResolvedValueOnce(
          makeAR({ paidAmount: 2_500_000, status: 'PAID' }),
        );

      await service.registerPayment('tenant-1', 'ar-1', {
        ...baseDto,
        amount: 2_500_000,
      });

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'payment.ar.completed',
        expect.objectContaining({
          tenantId: 'tenant-1',
          arId: 'ar-1',
          invoiceId: 'inv-1',
        }),
      );
    });

    it('does NOT emit payment.ar.completed for partial payments', async () => {
      arRepository.incrementPaid.mockResolvedValue(
        makeAR({
          paidAmount: 1_000_000,
          amount: 2_500_000,
          invoiceId: 'inv-1',
        }),
      );
      arRepository.findById
        .mockResolvedValueOnce(makeAR({ amount: 2_500_000, paidAmount: 0 }))
        .mockResolvedValueOnce(
          makeAR({ paidAmount: 1_000_000, status: 'PARTIAL' }),
        );

      await service.registerPayment('tenant-1', 'ar-1', baseDto);

      const calls = eventEmitter.emit.mock.calls.map((c) => c[0]);
      expect(calls).not.toContain('payment.ar.completed');
    });
  });
});
