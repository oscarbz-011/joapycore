import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PayablesService } from './payables.service';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeAP(overrides = {}) {
  return {
    id: 'ap-1',
    tenantId: 'tenant-1',
    purchaseReceiptId: 'receipt-1',
    supplierId: 'supplier-1',
    amount: 2_500_000,
    paidAmount: 0,
    status: 'PENDING' as const,
    dueDate: null,
    supplier: { id: 'supplier-1', name: 'Importadora ABC' },
    supplierPayments: [],
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('PayablesService', () => {
  let service: PayablesService;
  let apRepository: {
    findAll: jest.Mock;
    findById: jest.Mock;
    create: jest.Mock;
    incrementPaid: jest.Mock;
    updateStatus: jest.Mock;
  };
  let supplierPaymentsRepository: { create: jest.Mock };
  let eventEmitter: { emit: jest.Mock };
  let prisma: { $transaction: jest.Mock };

  beforeEach(() => {
    apRepository = {
      findAll: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      incrementPaid: jest.fn().mockResolvedValue(makeAP({ paidAmount: 0 })),
      updateStatus: jest.fn().mockResolvedValue(undefined),
    };
    supplierPaymentsRepository = {
      create: jest.fn().mockResolvedValue({ id: 'sp-1' }),
    };
    eventEmitter = { emit: jest.fn() };

    const tx = {};
    prisma = {
      $transaction: jest.fn().mockImplementation((cb) => cb(tx)),
    };

    service = new PayablesService(
      prisma as any,
      apRepository as any,
      supplierPaymentsRepository as any,
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
    it('delegates to repository', () => {
      apRepository.findAll.mockResolvedValue([makeAP()]);
      service.findAll('tenant-1');
      expect(apRepository.findAll).toHaveBeenCalledWith('tenant-1');
    });
  });

  // ── findOne ────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns AP when found', async () => {
      apRepository.findById.mockResolvedValue(makeAP());
      const result = await service.findOne('tenant-1', 'ap-1');
      expect(result.id).toBe('ap-1');
    });

    it('throws NotFoundException when AP does not exist', async () => {
      apRepository.findById.mockResolvedValue(null);
      await expect(service.findOne('tenant-1', 'ghost')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // ── registerPayment ────────────────────────────────────────────────────────

  describe('registerPayment', () => {
    it('throws UnprocessableEntityException when AP is already PAID', async () => {
      apRepository.findById.mockResolvedValue(makeAP({ status: 'PAID' }));

      await expect(
        service.registerPayment('tenant-1', 'ap-1', baseDto),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);

      expect(supplierPaymentsRepository.create).not.toHaveBeenCalled();
    });

    it('throws UnprocessableEntityException when AP is CANCELLED', async () => {
      apRepository.findById.mockResolvedValue(makeAP({ status: 'CANCELLED' }));

      await expect(
        service.registerPayment('tenant-1', 'ap-1', baseDto),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('throws UnprocessableEntityException when payment exceeds remaining balance', async () => {
      apRepository.findById.mockResolvedValue(
        makeAP({ amount: 1_000_000, paidAmount: 0 }),
      );

      await expect(
        service.registerPayment('tenant-1', 'ap-1', {
          ...baseDto,
          amount: 2_000_000,
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('creates payment and sets status to PARTIAL for partial payment', async () => {
      const updatedAP = makeAP({ paidAmount: 1_000_000, status: 'PARTIAL' });
      apRepository.incrementPaid.mockResolvedValue(
        makeAP({
          paidAmount: 1_000_000,
          amount: 2_500_000,
          purchaseReceiptId: 'receipt-1',
        }),
      );
      apRepository.findById
        .mockResolvedValueOnce(makeAP({ amount: 2_500_000, paidAmount: 0 }))
        .mockResolvedValueOnce(updatedAP);

      const result = await service.registerPayment('tenant-1', 'ap-1', baseDto);

      expect(supplierPaymentsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 1_000_000, paymentMethod: 'CASH' }),
        expect.anything(),
      );
      expect(apRepository.incrementPaid).toHaveBeenCalledWith(
        'ap-1',
        1_000_000,
        expect.anything(),
      );
      expect(apRepository.updateStatus).toHaveBeenCalledWith(
        'ap-1',
        'PARTIAL',
        expect.anything(),
      );
      expect(result?.status).toBe('PARTIAL');
    });

    it('creates payment and sets status to PAID when balance is cleared', async () => {
      const updatedAP = makeAP({ paidAmount: 2_500_000, status: 'PAID' });
      apRepository.incrementPaid.mockResolvedValue(
        makeAP({
          paidAmount: 2_500_000,
          amount: 2_500_000,
          purchaseReceiptId: 'receipt-1',
        }),
      );
      apRepository.findById
        .mockResolvedValueOnce(makeAP({ amount: 2_500_000, paidAmount: 0 }))
        .mockResolvedValueOnce(updatedAP);

      await service.registerPayment('tenant-1', 'ap-1', {
        ...baseDto,
        amount: 2_500_000,
      });

      expect(apRepository.incrementPaid).toHaveBeenCalledWith(
        'ap-1',
        2_500_000,
        expect.anything(),
      );
      expect(apRepository.updateStatus).toHaveBeenCalledWith(
        'ap-1',
        'PAID',
        expect.anything(),
      );
    });

    it('emits payment.ap.completed when AP is fully paid', async () => {
      apRepository.incrementPaid.mockResolvedValue(
        makeAP({
          paidAmount: 2_500_000,
          amount: 2_500_000,
          purchaseReceiptId: 'receipt-1',
        }),
      );
      apRepository.findById
        .mockResolvedValueOnce(makeAP({ amount: 2_500_000, paidAmount: 0 }))
        .mockResolvedValueOnce(
          makeAP({ paidAmount: 2_500_000, status: 'PAID' }),
        );

      await service.registerPayment('tenant-1', 'ap-1', {
        ...baseDto,
        amount: 2_500_000,
      });

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'payment.ap.completed',
        expect.objectContaining({
          tenantId: 'tenant-1',
          apId: 'ap-1',
          purchaseReceiptId: 'receipt-1',
        }),
      );
    });

    it('does NOT emit payment.ap.completed for partial payments', async () => {
      apRepository.incrementPaid.mockResolvedValue(
        makeAP({
          paidAmount: 1_000_000,
          amount: 2_500_000,
          purchaseReceiptId: 'receipt-1',
        }),
      );
      apRepository.findById
        .mockResolvedValueOnce(makeAP({ amount: 2_500_000, paidAmount: 0 }))
        .mockResolvedValueOnce(
          makeAP({ paidAmount: 1_000_000, status: 'PARTIAL' }),
        );

      await service.registerPayment('tenant-1', 'ap-1', baseDto);

      const calls = eventEmitter.emit.mock.calls.map((c) => c[0]);
      expect(calls).not.toContain('payment.ap.completed');
    });
  });
});
