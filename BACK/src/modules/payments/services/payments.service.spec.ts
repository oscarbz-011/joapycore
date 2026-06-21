import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
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
    updateAmounts: jest.Mock;
  };
  let paymentRecordsRepository: { create: jest.Mock };

  beforeEach(() => {
    arRepository = {
      findAll: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      updateAmounts: jest.fn().mockResolvedValue(undefined),
    };
    paymentRecordsRepository = { create: jest.fn().mockResolvedValue({ id: 'pr-1' }) };

    service = new PaymentsService(arRepository as any, paymentRecordsRepository as any);
  });

  const baseDto = {
    amount: 1_000_000,
    paymentMethod: 'CASH' as const,
    paymentDate: '2026-06-21',
  };

  // ── findAll ────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('delegates to repository', () => {
      arRepository.findAll.mockResolvedValue([makeAR()]);
      service.findAll('tenant-1');
      expect(arRepository.findAll).toHaveBeenCalledWith('tenant-1');
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
      await expect(service.findOne('tenant-1', 'ghost')).rejects.toBeInstanceOf(NotFoundException);
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
      arRepository.findById.mockResolvedValue(makeAR({ amount: 1_000_000, paidAmount: 0 }));

      await expect(
        service.registerPayment('tenant-1', 'ar-1', { ...baseDto, amount: 2_000_000 }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('creates payment and sets status to PARTIAL for partial payment', async () => {
      const updatedAR = makeAR({ paidAmount: 1_000_000, status: 'PARTIAL' });
      arRepository.findById
        .mockResolvedValueOnce(makeAR({ amount: 2_500_000, paidAmount: 0 }))
        .mockResolvedValueOnce(updatedAR);

      const result = await service.registerPayment('tenant-1', 'ar-1', baseDto);

      expect(paymentRecordsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 1_000_000, paymentMethod: 'CASH' }),
      );
      expect(arRepository.updateAmounts).toHaveBeenCalledWith('ar-1', 1_000_000, 'PARTIAL');
      expect(result?.status).toBe('PARTIAL');
    });

    it('creates payment and sets status to PAID when balance is cleared', async () => {
      const updatedAR = makeAR({ paidAmount: 2_500_000, status: 'PAID' });
      arRepository.findById
        .mockResolvedValueOnce(makeAR({ amount: 2_500_000, paidAmount: 0 }))
        .mockResolvedValueOnce(updatedAR);

      await service.registerPayment('tenant-1', 'ar-1', { ...baseDto, amount: 2_500_000 });

      expect(arRepository.updateAmounts).toHaveBeenCalledWith('ar-1', 2_500_000, 'PAID');
    });
  });
});
