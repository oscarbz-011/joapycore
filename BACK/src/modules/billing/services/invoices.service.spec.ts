import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { BillingSourcesRepository } from '../repositories/billing-sources.repository';
import { InvoicesRepository } from '../repositories/invoices.repository';

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
    paymentMethod: null,
    pdfFileId: null,
    sequential: null,
    createdAt: new Date(),
    updatedAt: new Date('2026-09-23T12:00:00.000Z'),
    saleOrder: {
      saleType: 'CASH',
      branch: { codigoEstablecimiento: '001', puntoExpedicion: '002' },
    },
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('InvoicesService', () => {
  let service: InvoicesService;
  let invoicesRepository: {
    findAll: jest.Mock;
    findById: jest.Mock;
    updateStatus: jest.Mock;
    claimIssue: jest.Mock;
    releaseIssueClaim: jest.Mock;
    cancelIfAllowed: jest.Mock;
    hasPdf: jest.Mock;
    finalizeIssue: jest.Mock;
    createInterestInvoice: jest.Mock;
    findLastSequential: jest.Mock;
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
  let branchFindFirstMock: jest.Mock;

  const realInvoicesRepository = new InvoicesRepository({} as any);

  beforeEach(() => {
    invoicesRepository = {
      findAll: jest.fn(),
      findById: jest.fn(),
      updateStatus: jest.fn().mockResolvedValue(undefined),
      claimIssue: jest.fn().mockResolvedValue({ count: 1 }),
      releaseIssueClaim: jest.fn().mockResolvedValue({ count: 1 }),
      cancelIfAllowed: jest.fn().mockResolvedValue({ count: 1 }),
      hasPdf: jest.fn().mockResolvedValue(true),
      finalizeIssue: jest.fn().mockResolvedValue({ count: 1 }),
      createInterestInvoice: jest.fn(),
      // Implementación real: consulta el tx que recibe (mockeado abajo).
      findLastSequential: jest.fn((...args: [string, string, string, any]) =>
        realInvoicesRepository.findLastSequential(...args),
      ),
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
    branchFindFirstMock = jest.fn().mockResolvedValue({
      codigoEstablecimiento: '001',
      puntoExpedicion: '002',
    });
    const tx = {
      invoice: { findFirst: invoiceFindFirstMock },
      branch: { findFirst: branchFindFirstMock },
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
      new BillingSourcesRepository(prisma as any),
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
    it('lets only one overlapping request claim a pending invoice', async () => {
      invoicesRepository.findById.mockResolvedValue(makeInvoice());
      invoicesRepository.claimIssue
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });
      const pdfStarted = deferred<void>();
      const releasePdf = deferred<void>();
      eventEmitter.emitAsync.mockImplementation((event: string) => {
        if (event === 'invoice.pdf.requested') {
          pdfStarted.resolve();
          return releasePdf.promise;
        }
        return Promise.resolve([]);
      });

      const first = service.issue('tenant-1', 'inv-1', {
        paymentCondition: 'CASH',
        paymentMethod: 'CASH',
      });
      await pdfStarted.promise;
      const second = service
        .issue('tenant-1', 'inv-1', {
          paymentCondition: 'CASH',
          paymentMethod: 'CASH',
        })
        .then(
          (value) => ({ status: 'fulfilled' as const, value }),
          (reason) => ({ status: 'rejected' as const, reason }),
        );
      await new Promise<void>((resolve) => setImmediate(resolve));
      releasePdf.resolve();

      const outcomes = [...(await Promise.allSettled([first])), await second];
      expect(
        outcomes.filter((outcome) => outcome.status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        outcomes.filter((outcome) => outcome.status === 'rejected'),
      ).toHaveLength(1);
      expect(
        eventEmitter.emitAsync.mock.calls.filter(
          ([event]) => event === 'invoice.pdf.requested',
        ),
      ).toHaveLength(1);
      expect(outbox.enqueue).toHaveBeenCalledTimes(1);
      expect(invoicesRepository.claimIssue).toHaveBeenCalledTimes(2);
    });

    it('can reclaim a stale pending issuance that never linked a PDF', async () => {
      invoicesRepository.findById.mockResolvedValue(
        makeInvoice({
          issuedAt: new Date('2026-09-22T10:00:00.000Z'),
          updatedAt: new Date('2026-09-22T10:00:00.000Z'),
          pdfFileId: null,
          sequential: 7,
        }),
      );

      await service.issue('tenant-1', 'inv-1', {
        paymentCondition: 'CASH',
        paymentMethod: 'CASH',
      });

      expect(invoicesRepository.claimIssue.mock.calls[0].slice(0, 2)).toEqual([
        'tenant-1',
        'inv-1',
      ]);
      expect(eventEmitter.emitAsync).toHaveBeenCalledWith(
        'invoice.pdf.requested',
        expect.objectContaining({ invoiceId: 'inv-1' }),
      );
    });

    it('preserves a PDF link when the renderer stores it but its acknowledgement fails', async () => {
      const persisted = makeInvoice({ pdfFileId: null });
      invoicesRepository.findById.mockImplementation(() =>
        Promise.resolve({ ...persisted }),
      );
      invoicesRepository.updateStatus.mockImplementation(
        (_tenantId, _id, status, extra) => {
          Object.assign(persisted, { status, ...extra });
          return Promise.resolve({ count: 1 });
        },
      );
      invoicesRepository.claimIssue.mockImplementation(
        (_tenantId, _id, _observedAt, attemptAt, data) => {
          Object.assign(persisted, { ...data, issuedAt: attemptAt });
          return Promise.resolve({ count: 1 });
        },
      );
      eventEmitter.emitAsync.mockImplementation((event: string) => {
        if (event === 'invoice.pdf.requested') {
          Object.assign(persisted, { pdfFileId: 'pdf-stored' });
          return Promise.reject(new Error('response lost after PDF link'));
        }
        return Promise.resolve([]);
      });

      await expect(
        service.issue('tenant-1', 'inv-1', {
          paymentCondition: 'CASH',
          paymentMethod: 'CASH',
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);

      expect(persisted.pdfFileId).toBe('pdf-stored');
      expect(persisted.issuedAt).toBeInstanceOf(Date);
      expect(persisted.paymentMethod).toBe('CASH');
      expect(outbox.enqueue).not.toHaveBeenCalled();
    });

    it('preserves a linked PDF if the post-render database read fails', async () => {
      const persisted = makeInvoice({ pdfFileId: null });
      invoicesRepository.findById.mockResolvedValue(persisted);
      invoicesRepository.claimIssue.mockImplementation(
        (_tenantId, _id, _observedAt, attemptAt, data) => {
          Object.assign(persisted, { ...data, issuedAt: attemptAt });
          return Promise.resolve({ count: 1 });
        },
      );
      eventEmitter.emitAsync.mockImplementation((event: string) => {
        if (event === 'invoice.pdf.requested') {
          Object.assign(persisted, { pdfFileId: 'pdf-stored' });
        }
        return Promise.resolve([]);
      });
      invoicesRepository.hasPdf.mockRejectedValue(new Error('read timeout'));

      await expect(
        service.issue('tenant-1', 'inv-1', {
          paymentCondition: 'CASH',
          paymentMethod: 'CASH',
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);

      expect(persisted.pdfFileId).toBe('pdf-stored');
      expect(persisted.issuedAt).toBeInstanceOf(Date);
      expect(invoicesRepository.releaseIssueClaim).toHaveBeenCalledWith(
        'tenant-1',
        'inv-1',
        persisted.issuedAt,
      );
      expect(outbox.enqueue).not.toHaveBeenCalled();
    });
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
      expect(invoicesRepository.claimIssue).toHaveBeenCalledWith(
        'tenant-1',
        'inv-1',
        expect.any(Date),
        expect.any(Date),
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

      expect(invoicesRepository.claimIssue).toHaveBeenCalledWith(
        'tenant-1',
        'inv-1',
        expect.any(Date),
        expect.any(Date),
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

      expect(invoicesRepository.claimIssue).toHaveBeenCalledWith(
        'tenant-1',
        'inv-1',
        expect.any(Date),
        expect.any(Date),
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
        expect.anything(),
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

      // El intento que falló libera su propia reclamación solo si sigue sin PDF.
      expect(invoicesRepository.claimIssue).toHaveBeenCalledTimes(1);
      expect(invoicesRepository.releaseIssueClaim).toHaveBeenCalledWith(
        'tenant-1',
        'inv-1',
        expect.any(Date),
      );
      // 'invoice.issued' must never fire — payments/sales react to it with
      // irreversible side effects (AR, stock) that we can't safely undo.
      expect(outbox.enqueue).not.toHaveBeenCalled();
    });

    it('does not finalize when the PDF listener resolves without persisting pdfFileId', async () => {
      invoicesRepository.findById.mockResolvedValue(makeInvoice());
      invoicesRepository.hasPdf.mockResolvedValue(false);

      await expect(
        service.issue('tenant-1', 'inv-1', {
          paymentCondition: 'CASH',
          paymentMethod: 'CASH',
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);

      expect(invoicesRepository.finalizeIssue).not.toHaveBeenCalled();
      expect(outbox.enqueue).not.toHaveBeenCalled();
    });

    it('reuses a persisted PDF when retrying an interrupted pending issuance', async () => {
      invoicesRepository.findById.mockResolvedValue(
        makeInvoice({
          pdfFileId: 'pdf-already-stored',
          issuedAt: new Date('2026-09-23T12:00:00.000Z'),
          paymentMethod: 'CASH',
          sequential: 7,
          invoiceNumber: '0000007',
          invoicePrefix: '001-002-',
        }),
      );

      await service.issue('tenant-1', 'inv-1', {
        paymentCondition: 'CASH',
        paymentMethod: 'CASH',
      });

      expect(eventEmitter.emitAsync).not.toHaveBeenCalledWith(
        'invoice.pdf.requested',
        expect.anything(),
      );
      expect(invoicesRepository.updateStatus).not.toHaveBeenCalledWith(
        'tenant-1',
        'inv-1',
        'PENDING',
        expect.objectContaining({ pdfFileId: null }),
        expect.anything(),
      );
      expect(invoicesRepository.finalizeIssue).toHaveBeenCalledWith(
        'tenant-1',
        'inv-1',
        expect.any(Date),
        expect.anything(),
      );
    });

    it('rejects changed issuance terms when a pending invoice already has a PDF', async () => {
      invoicesRepository.findById.mockResolvedValue(
        makeInvoice({
          pdfFileId: 'pdf-already-stored',
          issuedAt: new Date('2026-09-23T12:00:00.000Z'),
          paymentMethod: 'CASH',
          notes: 'Original',
          sequential: 7,
        }),
      );

      await expect(
        service.issue('tenant-1', 'inv-1', {
          paymentCondition: 'CASH',
          paymentMethod: 'CASH',
          notes: 'Changed',
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);

      expect(invoicesRepository.updateStatus).not.toHaveBeenCalled();
      expect(eventEmitter.emitAsync).not.toHaveBeenCalled();
      expect(invoicesRepository.finalizeIssue).not.toHaveBeenCalled();
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

  describe('retryPdf', () => {
    it('returns an issued invoice with a PDF without requesting another render', async () => {
      const invoice = makeInvoice({ status: 'ISSUED', pdfFileId: 'pdf-1' });
      invoicesRepository.findById.mockResolvedValue(invoice);

      await expect(service.retryPdf('tenant-1', 'inv-1')).resolves.toBe(
        invoice,
      );

      expect(eventEmitter.emitAsync).not.toHaveBeenCalled();
      expect(outbox.enqueue).not.toHaveBeenCalled();
    });

    it('regenerates a missing PDF without publishing invoice.issued again', async () => {
      invoicesRepository.findById.mockResolvedValue(
        makeInvoice({
          status: 'ISSUED',
          pdfFileId: null,
          issuedAt: new Date('2026-09-23T12:00:00.000Z'),
        }),
      );

      await service.retryPdf('tenant-1', 'inv-1', 'user-1');

      expect(eventEmitter.emitAsync).toHaveBeenCalledWith(
        'invoice.pdf.requested',
        expect.objectContaining({ invoiceId: 'inv-1', issuedById: 'user-1' }),
      );
      expect(invoicesRepository.hasPdf).toHaveBeenCalledWith(
        'tenant-1',
        'inv-1',
      );
      expect(outbox.enqueue).not.toHaveBeenCalled();
    });

    it('keeps historical invoice state and reports an error if PDF regeneration fails', async () => {
      invoicesRepository.findById.mockResolvedValue(
        makeInvoice({
          status: 'ISSUED',
          pdfFileId: null,
          issuedAt: new Date('2026-09-23T12:00:00.000Z'),
        }),
      );
      eventEmitter.emitAsync.mockRejectedValue(new Error('storage down'));

      await expect(
        service.retryPdf('tenant-1', 'inv-1', 'user-1'),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);

      expect(invoicesRepository.updateStatus).not.toHaveBeenCalled();
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

      expect(branchFindFirstMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'branch-1', tenantId: 'tenant-1' },
        }),
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

      expect(branchFindFirstMock).not.toHaveBeenCalled();
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
    it('does not cancel a recent pending issuance claim even if its PDF has not linked yet', async () => {
      invoicesRepository.cancelIfAllowed.mockResolvedValue({ count: 0 });
      invoicesRepository.findById.mockResolvedValue(
        makeInvoice({
          issuedAt: new Date(),
          pdfFileId: null,
        }),
      );

      await expect(
        service.cancel('tenant-1', 'inv-1', 'customer request'),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);

      expect(creditNotesRepository.create).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalledWith(
        'invoice.cancelled',
        expect.anything(),
      );
    });

    it('rejects cancellation while a pending invoice issuance owns the claim', async () => {
      invoicesRepository.cancelIfAllowed.mockResolvedValue({ count: 0 });
      invoicesRepository.findById.mockResolvedValue(makeInvoice());
      const pdfStarted = deferred<void>();
      const releasePdf = deferred<void>();
      eventEmitter.emitAsync.mockImplementation((event: string) => {
        if (event === 'invoice.pdf.requested') {
          pdfStarted.resolve();
          return releasePdf.promise;
        }
        return Promise.resolve([]);
      });

      const issuance = service.issue('tenant-1', 'inv-1', {
        paymentCondition: 'CASH',
        paymentMethod: 'CASH',
      });
      await pdfStarted.promise;
      const [cancellation] = await Promise.allSettled([
        service.cancel('tenant-1', 'inv-1', 'customer request'),
      ]);
      releasePdf.resolve();
      await issuance;

      expect(cancellation.status).toBe('rejected');
      expect(creditNotesRepository.create).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalledWith(
        'invoice.cancelled',
        expect.anything(),
      );
    });
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

      expect(invoicesRepository.cancelIfAllowed).toHaveBeenCalledWith(
        'tenant-1',
        'inv-1',
        'PENDING',
        expect.any(Date),
        expect.any(Date),
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

      expect(invoicesRepository.cancelIfAllowed).toHaveBeenCalled();
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

    it('does not create a credit note when an issued invoice changes before cancellation commits', async () => {
      invoicesRepository.findById.mockResolvedValue(
        makeInvoice({ status: 'ISSUED' }),
      );
      invoicesRepository.cancelIfAllowed.mockResolvedValue({ count: 0 });

      await expect(
        service.cancel('tenant-1', 'inv-1', 'customer request'),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);

      expect(creditNotesRepository.generateNumber).not.toHaveBeenCalled();
      expect(creditNotesRepository.create).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalledWith(
        'invoice.cancelled',
        expect.anything(),
      );
    });
  });
});
