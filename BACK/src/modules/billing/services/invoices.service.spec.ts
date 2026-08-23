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
    saleOrder: {
      branch: { codigoEstablecimiento: '001', puntoExpedicion: '002' },
    },
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
  let eventEmitter: { emit: jest.Mock; emitAsync: jest.Mock };
  let prisma: { $transaction: jest.Mock };
  let invoiceFindFirstMock: jest.Mock;

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
    eventEmitter = { emit: jest.fn(), emitAsync: jest.fn().mockResolvedValue([]) };

    invoiceFindFirstMock = jest.fn().mockResolvedValue(null);
    const tx = { invoice: { findFirst: invoiceFindFirstMock } };
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

  // ── issue ──────────────────────────────────────────────────────────────────

  describe('issue', () => {
    it('throws UnprocessableEntityException when invoice is not PENDING', async () => {
      invoicesRepository.findById.mockResolvedValue(makeInvoice({ status: 'ISSUED' }));

      await expect(
        service.issue('tenant-1', 'inv-1', { paymentCondition: 'CASH', paymentMethod: 'CASH' as never }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(invoicesRepository.updateStatus).not.toHaveBeenCalled();
    });

    it('throws UnprocessableEntityException for CREDIT without dueDate', async () => {
      invoicesRepository.findById.mockResolvedValue(makeInvoice());

      await expect(
        service.issue('tenant-1', 'inv-1', { paymentCondition: 'CREDIT' }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(invoicesRepository.updateStatus).not.toHaveBeenCalled();
    });

    it('auto-generates the invoice number from the branch establecimiento/puntoExpedicion — never accepts one from the client', async () => {
      invoicesRepository.findById.mockResolvedValue(makeInvoice());
      invoiceFindFirstMock.mockResolvedValue({ sequential: 4 });

      await service.issue('tenant-1', 'inv-1', { paymentCondition: 'CASH', paymentMethod: 'CASH' as never });

      expect(invoiceFindFirstMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 'tenant-1', establecimiento: '001', puntoExpedicion: '002' },
        }),
      );
      expect(invoicesRepository.updateStatus).toHaveBeenCalledWith(
        'tenant-1',
        'inv-1',
        'ISSUED',
        expect.objectContaining({
          establecimiento: '001',
          puntoExpedicion: '002',
          sequential: 5,
          invoiceNumber: '0000005',
          invoicePrefix: '001-002-',
        }),
        expect.anything(),
      );
    });

    it('starts sequential numbering at 1 for the first invoice of an establecimiento/puntoExpedicion', async () => {
      invoicesRepository.findById.mockResolvedValue(makeInvoice());
      invoiceFindFirstMock.mockResolvedValue(null);

      await service.issue('tenant-1', 'inv-1', { paymentCondition: 'CASH', paymentMethod: 'CASH' as never });

      expect(invoicesRepository.updateStatus).toHaveBeenCalledWith(
        'tenant-1',
        'inv-1',
        'ISSUED',
        expect.objectContaining({ sequential: 1, invoiceNumber: '0000001' }),
        expect.anything(),
      );
    });

    it("falls back to '001'/'001' when the sale order has no branch configured", async () => {
      invoicesRepository.findById.mockResolvedValue(makeInvoice({ saleOrder: { branch: null } }));

      await service.issue('tenant-1', 'inv-1', { paymentCondition: 'CASH', paymentMethod: 'CASH' as never });

      expect(invoicesRepository.updateStatus).toHaveBeenCalledWith(
        'tenant-1',
        'inv-1',
        'ISSUED',
        expect.objectContaining({ establecimiento: '001', puntoExpedicion: '001' }),
        expect.anything(),
      );
    });

    it('awaits invoice.issued via emitAsync before returning (so the PDF listener has a chance to finish)', async () => {
      invoicesRepository.findById.mockResolvedValue(makeInvoice());

      await service.issue('tenant-1', 'inv-1', { paymentCondition: 'CASH', paymentMethod: 'CASH' as never });

      expect(eventEmitter.emitAsync).toHaveBeenCalledWith(
        'invoice.issued',
        expect.objectContaining({ tenantId: 'tenant-1', invoiceId: 'inv-1' }),
      );
      expect(eventEmitter.emit).not.toHaveBeenCalledWith('invoice.issued', expect.anything());
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
