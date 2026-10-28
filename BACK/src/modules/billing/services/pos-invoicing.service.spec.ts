import { NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PosInvoicingService } from './pos-invoicing.service';

const tx = { marker: 'tx' } as unknown as Prisma.TransactionClient;
const AT = new Date('2026-06-15T15:00:00.000Z');

const NUMBERING = {
  seriesId: 'series-1',
  modality: 'SELF_PRINTED' as const,
  timbrado: '12345678',
  timbradoValidFrom: new Date('2026-01-01T00:00:00.000Z'),
  timbradoValidUntil: new Date('2026-12-31T00:00:00.000Z'),
  serieCode: '',
  establecimiento: '001',
  puntoExpedicion: '002',
  sequential: 41,
  invoiceNumber: '0000041',
  invoicePrefix: '001-002-',
};

describe('PosInvoicingService', () => {
  let seriesRepository: { findById: jest.Mock };
  let seriesService: { numberForIssue: jest.Mock; formFitProblem: jest.Mock };
  let invoicesRepository: {
    createPaid: jest.Mock;
    findById: jest.Mock;
    findForReceipt: jest.Mock;
  };
  let billingSources: { findSaleOrderForInvoicing: jest.Mock };
  let outbox: { enqueue: jest.Mock };
  let eventEmitter: { emitAsync: jest.Mock };
  let service: PosInvoicingService;

  const input = {
    saleOrderId: 'order-1',
    branchId: 'branch-1',
    seriesId: 'series-1',
    anonymousBuyer: true,
    paymentMethod: 'CASH' as const,
    issuedById: 'cashier-1',
    at: AT,
  };

  beforeEach(() => {
    seriesRepository = { findById: jest.fn() };
    seriesService = {
      numberForIssue: jest.fn().mockResolvedValue(NUMBERING),
      formFitProblem: jest.fn().mockResolvedValue(null),
    };
    invoicesRepository = {
      createPaid: jest.fn().mockResolvedValue({ id: 'inv-1' }),
      findById: jest.fn(),
      findForReceipt: jest.fn(),
      recordFormPrint: jest.fn().mockResolvedValue({ count: 1 }),
    } as typeof invoicesRepository;
    billingSources = {
      findSaleOrderForInvoicing: jest.fn().mockResolvedValue({
        saleType: 'CASH',
        items: [
          {
            quantity: 2,
            unitPrice: 110_000,
            financedUnitPrice: null,
            description: null,
            product: { name: 'Licuadora', ivaTaxRate: 10 },
          },
        ],
      }),
    };
    outbox = { enqueue: jest.fn().mockResolvedValue('event-1') };
    eventEmitter = { emitAsync: jest.fn().mockResolvedValue([]) };
    service = new PosInvoicingService(
      seriesRepository as any,
      seriesService as any,
      invoicesRepository as any,
      billingSources as any,
      outbox as any,
      eventEmitter as any,
    );
  });

  describe('issuePosInvoice', () => {
    it('numbers the invoice with the terminal series inside the sale transaction', async () => {
      await service.issuePosInvoice(tx, 'tenant-1', {
        ...input,
        documentNumber: 41,
      });

      expect(billingSources.findSaleOrderForInvoicing).toHaveBeenCalledWith(
        'tenant-1',
        'order-1',
        tx,
      );
      expect(seriesService.numberForIssue).toHaveBeenCalledWith(
        'tenant-1',
        {
          branchId: 'branch-1',
          seriesId: 'series-1',
          documentNumber: 41,
          at: AT,
        },
        tx,
      );
    });

    it('stores it paid, with the IVA of each item and the anonymous buyer', async () => {
      await service.issuePosInvoice(tx, 'tenant-1', input);

      expect(invoicesRepository.createPaid).toHaveBeenCalledWith(
        'tenant-1',
        {
          saleOrderId: 'order-1',
          numbering: NUMBERING,
          total: 220_000,
          issuedAt: AT,
          paymentMethod: 'CASH',
          anonymousBuyer: true,
          items: [
            {
              description: 'Licuadora',
              quantity: 2,
              unitPrice: 110_000,
              total: 220_000,
              ivaRate: 10,
              ivaAmount: 20_000,
              unitPriceWithoutIva: 100_000,
            },
          ],
        },
        tx,
      );
    });

    it('publishes invoice.issued through the outbox of the same transaction', async () => {
      const result = await service.issuePosInvoice(tx, 'tenant-1', input);

      expect(outbox.enqueue).toHaveBeenCalledWith(
        tx,
        'tenant-1',
        'invoice.issued',
        expect.objectContaining({
          invoiceId: 'inv-1',
          saleOrderId: 'order-1',
          paymentCondition: 'CASH',
          total: 220_000,
        }),
      );
      expect(result).toEqual({ invoiceId: 'inv-1', eventId: 'event-1' });
    });

    it('rejects a talonario sale with more items than lines on the sheet', async () => {
      seriesService.numberForIssue.mockResolvedValue({
        ...NUMBERING,
        modality: 'PREPRINTED',
      });
      seriesService.formFitProblem.mockResolvedValue(
        'La factura tiene 1 ítems y la hoja del talonario admite 0.',
      );

      await expect(
        service.issuePosInvoice(tx, 'tenant-1', {
          ...input,
          documentNumber: 41,
        }),
      ).rejects.toThrow('la hoja del talonario admite 0');
      expect(seriesService.formFitProblem).toHaveBeenCalledWith(
        'tenant-1',
        'series-1',
        1,
        tx,
      );
      expect(invoicesRepository.createPaid).not.toHaveBeenCalled();
    });

    it('does not check the sheet with a self-printed series', async () => {
      await service.issuePosInvoice(tx, 'tenant-1', input);
      expect(seriesService.formFitProblem).not.toHaveBeenCalled();
    });

    it('fails when the sale is not of the tenant', async () => {
      billingSources.findSaleOrderForInvoicing.mockResolvedValue(null);

      await expect(
        service.issuePosInvoice(tx, 'tenant-2', input),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(invoicesRepository.createPaid).not.toHaveBeenCalled();
    });
  });

  describe('findSeries', () => {
    it('summarizes the series and says why it cannot number today', async () => {
      seriesRepository.findById.mockResolvedValue({
        id: 'series-1',
        branchId: 'branch-1',
        documentType: 'INVOICE',
        modality: 'PREPRINTED',
        establecimiento: '001',
        puntoExpedicion: '002',
        timbrado: '12345678',
        rangeFrom: 1,
        rangeTo: 500,
        nextNumber: 42,
        isActive: true,
        validFrom: new Date('2020-01-01T00:00:00.000Z'),
        validUntil: new Date('2020-12-31T00:00:00.000Z'),
      });

      const summary = await service.findSeries('tenant-1', 'series-1');

      expect(seriesRepository.findById).toHaveBeenCalledWith(
        'tenant-1',
        'series-1',
      );
      expect(summary).toMatchObject({
        modality: 'PREPRINTED',
        isInvoiceSeries: true,
        nextNumber: 42,
        problem: 'El timbrado venció el 31/12/2020',
      });
    });

    it('returns null for a series of another tenant', async () => {
      seriesRepository.findById.mockResolvedValue(null);
      await expect(
        service.findSeries('tenant-2', 'series-1'),
      ).resolves.toBeNull();
    });
  });

  describe('requestPdf', () => {
    it('renders the A4 in the background with the issuance it has', async () => {
      invoicesRepository.findById.mockResolvedValue({
        id: 'inv-1',
        saleOrderId: 'order-1',
        issuedAt: AT,
        pdfFileId: null,
        status: 'PAID',
        total: 220_000,
      });

      service.requestPdf('tenant-1', 'inv-1');
      await new Promise((resolve) => setImmediate(resolve));

      expect(eventEmitter.emitAsync).toHaveBeenCalledWith(
        'invoice.pdf.requested',
        expect.objectContaining({
          invoiceId: 'inv-1',
          attemptAt: AT,
          expectedStatus: 'PAID',
        }),
      );
    });

    it('does not render a PDF for a talonario invoice', async () => {
      invoicesRepository.findById.mockResolvedValue({
        id: 'inv-1',
        issuedAt: AT,
        pdfFileId: null,
        modality: 'PREPRINTED',
        status: 'PAID',
        total: 220_000,
      });

      service.requestPdf('tenant-1', 'inv-1');
      await new Promise((resolve) => setImmediate(resolve));

      expect(eventEmitter.emitAsync).not.toHaveBeenCalled();
    });

    it('records a print on the talonario sheet', async () => {
      await service.recordFormPrint('tenant-1', 'inv-1');
      expect((invoicesRepository as any).recordFormPrint).toHaveBeenCalledWith(
        'tenant-1',
        'inv-1',
        expect.any(Date),
      );
    });

    it('never throws to the cash register if the PDF fails', async () => {
      invoicesRepository.findById.mockRejectedValue(new Error('db down'));

      expect(() => service.requestPdf('tenant-1', 'inv-1')).not.toThrow();
      await new Promise((resolve) => setImmediate(resolve));
    });
  });
});
