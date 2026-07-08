import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { InvoicesService } from './invoices.service';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeInvoice(overrides = {}) {
  return {
    id: 'inv-1',
    tenantId: 'tenant-1',
    saleOrderId: 'order-1',
    status: 'PENDING' as const,
    total: { toString: () => '2500000' },
    issuedAt: null,
    dueDate: null,
    notes: null,
    createdAt: new Date(),
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('InvoicesService', () => {
  let service: InvoicesService;
  let invoicesRepository: {
    findAll: jest.Mock;
    findById: jest.Mock;
    updateStatus: jest.Mock;
  };
  let creditNotesRepository: {
    findAll: jest.Mock;
    create: jest.Mock;
    generateNumber: jest.Mock;
  };
  let eventEmitter: { emit: jest.Mock };
  let prisma: { $transaction: jest.Mock };

  beforeEach(() => {
    invoicesRepository = {
      findAll: jest.fn(),
      findById: jest.fn(),
      updateStatus: jest.fn().mockResolvedValue(undefined),
    };
    creditNotesRepository = {
      findAll: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({}),
      generateNumber: jest.fn().mockResolvedValue('NC-0001'),
    };
    eventEmitter = { emit: jest.fn() };

    const tx = {};
    prisma = {
      $transaction: jest.fn().mockImplementation((cb) => cb(tx)),
    };

    service = new InvoicesService(
      prisma as any,
      invoicesRepository as any,
      creditNotesRepository as any,
      eventEmitter as any,
    );
  });

  // ── findAll ────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('delegates to repository', () => {
      invoicesRepository.findAll.mockResolvedValue([makeInvoice()]);
      service.findAll('tenant-1');
      expect(invoicesRepository.findAll).toHaveBeenCalledWith('tenant-1');
    });
  });

  // ── findOne ────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns invoice when found', async () => {
      invoicesRepository.findById.mockResolvedValue(makeInvoice());
      const result = await service.findOne('tenant-1', 'inv-1');
      expect(result.id).toBe('inv-1');
    });

    it('throws NotFoundException when invoice does not exist', async () => {
      invoicesRepository.findById.mockResolvedValue(null);
      await expect(service.findOne('tenant-1', 'ghost')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ── cancel ─────────────────────────────────────────────────────────────────

  describe('cancel', () => {
    it('throws UnprocessableEntityException when invoice is already CANCELLED', async () => {
      invoicesRepository.findById.mockResolvedValue(makeInvoice({ status: 'CANCELLED' }));

      await expect(service.cancel('tenant-1', 'inv-1', 'motivo test')).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      expect(invoicesRepository.updateStatus).not.toHaveBeenCalled();
    });

    it('throws UnprocessableEntityException when invoice is PAID', async () => {
      invoicesRepository.findById.mockResolvedValue(makeInvoice({ status: 'PAID' }));

      await expect(service.cancel('tenant-1', 'inv-1', 'motivo test')).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      expect(invoicesRepository.updateStatus).not.toHaveBeenCalled();
    });

    it('cancels a PENDING invoice without creating a credit note', async () => {
      const cancelled = makeInvoice({ status: 'CANCELLED' });
      invoicesRepository.findById
        .mockResolvedValueOnce(makeInvoice({ status: 'PENDING' }))
        .mockResolvedValueOnce(cancelled);

      const result = await service.cancel('tenant-1', 'inv-1', 'motivo test');

      expect(invoicesRepository.updateStatus).toHaveBeenCalledWith('tenant-1', 'inv-1', 'CANCELLED', undefined, expect.anything());
      expect(creditNotesRepository.create).not.toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'invoice.cancelled',
        expect.objectContaining({ tenantId: 'tenant-1', invoiceId: 'inv-1' }),
      );
      expect(result?.status).toBe('CANCELLED');
    });

    it('cancels an ISSUED invoice and generates a credit note', async () => {
      const cancelled = makeInvoice({ status: 'CANCELLED' });
      invoicesRepository.findById
        .mockResolvedValueOnce(makeInvoice({ status: 'ISSUED' }))
        .mockResolvedValueOnce(cancelled);

      await service.cancel('tenant-1', 'inv-1', 'cliente solicitó cambio de producto');

      expect(invoicesRepository.updateStatus).toHaveBeenCalled();
      expect(creditNotesRepository.generateNumber).toHaveBeenCalledWith('tenant-1');
      expect(creditNotesRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          invoiceId: 'inv-1',
          reason: 'cliente solicitó cambio de producto',
          number: 'NC-0001',
        }),
        expect.anything(),
      );
    });
  });
});
