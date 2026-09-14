import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
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
    createInterestInvoice: jest.Mock;
  };
  let creditNotesRepository: {
    findAll: jest.Mock;
    create: jest.Mock;
    generateNumber: jest.Mock;
  };
  let eventEmitter: { emit: jest.Mock; emitAsync: jest.Mock };
  let outbox: { enqueue: jest.Mock; dispatch: jest.Mock };
  let prisma: { $transaction: jest.Mock };
  let invoiceFindFirstMock: jest.Mock;
  let branchFindUniqueMock: jest.Mock;

  beforeEach(() => {
    invoicesRepository = {
      findAll: jest.fn(),
      findById: jest.fn(),
      updateStatus: jest.fn().mockResolvedValue(undefined),
      createInterestInvoice: jest.fn(),
    };
    creditNotesRepository = {
      findAll: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({}),
      generateNumber: jest.fn().mockResolvedValue('NC-0001'),
    };
    eventEmitter = {
      emit: jest.fn(),
      emitAsync: jest.fn().mockResolvedValue([]),
    };

    invoiceFindFirstMock = jest.fn().mockResolvedValue(null);
    branchFindUniqueMock = jest.fn().mockResolvedValue({
      codigoEstablecimiento: '001',
      puntoExpedicion: '002',
    });
    const tx = {
      invoice: { findFirst: invoiceFindFirstMock },
      branch: { findUnique: branchFindUniqueMock },
    };
    prisma = {
      $transaction: jest.fn().mockImplementation((cb) => cb(tx)),
    };

    outbox = {
      enqueue: jest.fn().mockResolvedValue('event-1'),
      dispatch: jest.fn().mockResolvedValue(true),
    };
    service = new InvoicesService(
      prisma as any,
      invoicesRepository as any,
      creditNotesRepository as any,
      eventEmitter as any,
      outbox as any,
    );
  });

  // ── findAll ────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('delegates to repository', async () => {
      invoicesRepository.findAll.mockResolvedValue([makeInvoice()]);
      await service.findAll('tenant-1');
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
      await expect(service.findOne('tenant-1', 'ghost')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // ── issue ──────────────────────────────────────────────────────────────────

  describe('issue', () => {
    it('throws UnprocessableEntityException when the invoice has no saleOrder (defensive — should never happen)', async () => {
      invoicesRepository.findById.mockResolvedValue(
        makeInvoice({ saleOrder: null }),
      );

      await expect(
        service.issue('tenant-1', 'inv-1', {
          paymentCondition: 'CASH',
          paymentMethod: 'CASH',
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(invoicesRepository.updateStatus).not.toHaveBeenCalled();
    });

    it('throws UnprocessableEntityException when invoice is not PENDING', async () => {
      invoicesRepository.findById.mockResolvedValue(
        makeInvoice({ status: 'ISSUED' }),
      );

      await expect(
        service.issue('tenant-1', 'inv-1', {
          paymentCondition: 'CASH',
          paymentMethod: 'CASH',
        }),
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

      await service.issue('tenant-1', 'inv-1', {
        paymentCondition: 'CASH',
        paymentMethod: 'CASH',
      });

      expect(invoiceFindFirstMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenantId: 'tenant-1',
            establecimiento: '001',
            puntoExpedicion: '002',
          },
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

      await service.issue('tenant-1', 'inv-1', {
        paymentCondition: 'CASH',
        paymentMethod: 'CASH',
      });

      expect(invoicesRepository.updateStatus).toHaveBeenCalledWith(
        'tenant-1',
        'inv-1',
        'ISSUED',
        expect.objectContaining({ sequential: 1, invoiceNumber: '0000001' }),
        expect.anything(),
      );
    });

    it("falls back to '001'/'001' when the sale order has no branch configured", async () => {
      invoicesRepository.findById.mockResolvedValue(
        makeInvoice({ saleOrder: { branch: null } }),
      );

      await service.issue('tenant-1', 'inv-1', {
        paymentCondition: 'CASH',
        paymentMethod: 'CASH',
      });

      expect(invoicesRepository.updateStatus).toHaveBeenCalledWith(
        'tenant-1',
        'inv-1',
        'ISSUED',
        expect.objectContaining({
          establecimiento: '001',
          puntoExpedicion: '001',
        }),
        expect.anything(),
      );
    });

    it('awaits invoice.pdf.requested and delivers invoice.issued through the outbox before returning', async () => {
      invoicesRepository.findById.mockResolvedValue(makeInvoice());

      await service.issue('tenant-1', 'inv-1', {
        paymentCondition: 'CASH',
        paymentMethod: 'CASH',
      });

      expect(eventEmitter.emitAsync).toHaveBeenCalledWith(
        'invoice.pdf.requested',
        expect.objectContaining({ tenantId: 'tenant-1', invoiceId: 'inv-1' }),
      );
      expect(outbox.enqueue).toHaveBeenCalledWith(
        prisma,
        'tenant-1',
        'invoice.issued',
        expect.objectContaining({ tenantId: 'tenant-1', invoiceId: 'inv-1' }),
      );
      expect(outbox.dispatch).toHaveBeenCalledWith('event-1');
      expect(eventEmitter.emit).not.toHaveBeenCalledWith(
        'invoice.issued',
        expect.anything(),
      );
    });

    it('reverts the invoice to PENDING and throws when invoice.pdf.requested fails (e.g. connection lost mid-issue)', async () => {
      invoicesRepository.findById.mockResolvedValue(makeInvoice());
      eventEmitter.emitAsync.mockImplementation((event: string) =>
        event === 'invoice.pdf.requested'
          ? Promise.reject(new Error('ECONNRESET'))
          : Promise.resolve([]),
      );

      await expect(
        service.issue('tenant-1', 'inv-1', {
          paymentCondition: 'CASH',
          paymentMethod: 'CASH',
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);

      // First call put it ISSUED (inside the numbering transaction); the
      // second call must revert it back to PENDING and null out every
      // ISSUED-only field, including the sequential number it had just
      // claimed — nothing about "emitted" can survive this failure.
      expect(invoicesRepository.updateStatus).toHaveBeenCalledTimes(2);
      expect(invoicesRepository.updateStatus).toHaveBeenNthCalledWith(
        1,
        'tenant-1',
        'inv-1',
        'ISSUED',
        expect.anything(),
        expect.anything(),
      );
      expect(invoicesRepository.updateStatus).toHaveBeenNthCalledWith(
        2,
        'tenant-1',
        'inv-1',
        'PENDING',
        expect.objectContaining({
          issuedAt: null,
          sequential: null,
          invoiceNumber: null,
          invoicePrefix: null,
        }),
      );
      // 'invoice.issued' must never fire — payments/sales react to it with
      // irreversible side effects (AR, stock) that we can't safely undo.
      expect(outbox.enqueue).not.toHaveBeenCalled();
    });

    it('reverts to PENDING and throws when the credit due-date reschedule fails, without ever requesting the PDF', async () => {
      invoicesRepository.findById.mockResolvedValue(makeInvoice());
      eventEmitter.emitAsync.mockImplementation((event: string) =>
        event === 'invoice.duedate.selected'
          ? Promise.reject(new Error('ECONNRESET'))
          : Promise.resolve([]),
      );

      await expect(
        service.issue('tenant-1', 'inv-1', {
          paymentCondition: 'CREDIT',
          dueDate: '2026-10-05',
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);

      expect(eventEmitter.emitAsync).not.toHaveBeenCalledWith(
        'invoice.pdf.requested',
        expect.anything(),
      );
      expect(outbox.enqueue).not.toHaveBeenCalled();
    });
  });

  // ── createInterestInvoiceFromReceipt ──────────────────────────────────────

  describe('createInterestInvoiceFromReceipt', () => {
    function makeParams(overrides = {}) {
      return {
        paymentReceiptId: 'receipt-1',
        branchId: 'branch-1',
        issuedAt: new Date('2026-08-26'),
        items: [
          {
            description:
              'Intereses moratorios correspondientes a la cuota N° 1 de la Factura a Crédito N° 001-001-0000011',
            quantity: 1,
            unitPrice: 350_000,
            total: 350_000,
            ivaRate: 10,
            ivaAmount: 31_818,
            unitPriceWithoutIva: 318_182,
          },
        ],
        ...overrides,
      };
    }

    beforeEach(() => {
      invoicesRepository.createInterestInvoice.mockResolvedValue({
        id: 'inv-interest-1',
        total: 350_000,
      });
    });

    it('creates the invoice as invoiceType INTEREST, status PAID, with no saleOrder', async () => {
      await service.createInterestInvoiceFromReceipt('tenant-1', makeParams());

      expect(invoicesRepository.createInterestInvoice).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({
          paymentReceiptId: 'receipt-1',
          total: 350_000,
          items: makeParams().items,
        }),
        expect.anything(),
      );
    });

    it('auto-generates numbering from the branch, continuing the tenant general invoice sequence', async () => {
      invoiceFindFirstMock.mockResolvedValue({ sequential: 12 });

      await service.createInterestInvoiceFromReceipt('tenant-1', makeParams());

      expect(branchFindUniqueMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'branch-1' } }),
      );
      expect(invoiceFindFirstMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenantId: 'tenant-1',
            establecimiento: '001',
            puntoExpedicion: '002',
          },
        }),
      );
      expect(invoicesRepository.createInterestInvoice).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({
          establecimiento: '001',
          puntoExpedicion: '002',
          sequential: 13,
          invoiceNumber: '0000013',
          invoicePrefix: '001-002-',
        }),
        expect.anything(),
      );
    });

    it("falls back to '001'/'001' when there is no branchId", async () => {
      await service.createInterestInvoiceFromReceipt(
        'tenant-1',
        makeParams({ branchId: null }),
      );

      expect(branchFindUniqueMock).not.toHaveBeenCalled();
      expect(invoicesRepository.createInterestInvoice).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({
          establecimiento: '001',
          puntoExpedicion: '001',
        }),
        expect.anything(),
      );
    });

    it('sums the total across all items', async () => {
      await service.createInterestInvoiceFromReceipt(
        'tenant-1',
        makeParams({
          items: [
            {
              description: 'Cuota N° 1',
              quantity: 1,
              unitPrice: 100_000,
              total: 100_000,
              ivaRate: 10,
              ivaAmount: 9091,
              unitPriceWithoutIva: 90_909,
            },
            {
              description: 'Cuota N° 2',
              quantity: 1,
              unitPrice: 50_000,
              total: 50_000,
              ivaRate: 10,
              ivaAmount: 4545,
              unitPriceWithoutIva: 45_455,
            },
          ],
        }),
      );

      expect(invoicesRepository.createInterestInvoice).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({ total: 150_000 }),
        expect.anything(),
      );
    });

    it('emits invoice.interest.issued and audit.log after creating the invoice', async () => {
      await service.createInterestInvoiceFromReceipt('tenant-1', makeParams());

      expect(eventEmitter.emitAsync).toHaveBeenCalledWith(
        'invoice.interest.issued',
        expect.objectContaining({
          tenantId: 'tenant-1',
          invoiceId: 'inv-interest-1',
          paymentReceiptId: 'receipt-1',
          total: 350_000,
        }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'audit.log',
        expect.objectContaining({
          tenantId: 'tenant-1',
          module: 'billing',
          action: 'invoice.interest.issued',
          resourceId: 'inv-interest-1',
        }),
      );
    });
  });

  // ── cancel ─────────────────────────────────────────────────────────────────

  describe('cancel', () => {
    it('throws UnprocessableEntityException when invoice is already CANCELLED', async () => {
      invoicesRepository.findById.mockResolvedValue(
        makeInvoice({ status: 'CANCELLED' }),
      );

      await expect(
        service.cancel('tenant-1', 'inv-1', 'motivo test'),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(invoicesRepository.updateStatus).not.toHaveBeenCalled();
    });

    it('throws UnprocessableEntityException when invoice is PAID', async () => {
      invoicesRepository.findById.mockResolvedValue(
        makeInvoice({ status: 'PAID' }),
      );

      await expect(
        service.cancel('tenant-1', 'inv-1', 'motivo test'),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(invoicesRepository.updateStatus).not.toHaveBeenCalled();
    });

    it('cancels a PENDING invoice without creating a credit note', async () => {
      const cancelled = makeInvoice({ status: 'CANCELLED' });
      invoicesRepository.findById
        .mockResolvedValueOnce(makeInvoice({ status: 'PENDING' }))
        .mockResolvedValueOnce(cancelled);

      const result = await service.cancel('tenant-1', 'inv-1', 'motivo test');

      expect(invoicesRepository.updateStatus).toHaveBeenCalledWith(
        'tenant-1',
        'inv-1',
        'CANCELLED',
        undefined,
        expect.anything(),
      );
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

      await service.cancel(
        'tenant-1',
        'inv-1',
        'cliente solicitó cambio de producto',
      );

      expect(invoicesRepository.updateStatus).toHaveBeenCalled();
      expect(creditNotesRepository.generateNumber).toHaveBeenCalledWith(
        'tenant-1',
      );
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
