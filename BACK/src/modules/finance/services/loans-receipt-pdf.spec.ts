import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { LoansService } from './loans.service';

const receipt = (overrides: Record<string, unknown> = {}) => ({
  id: 'receipt-1',
  pdfFileId: null,
  interestInvoice: null,
  ...overrides,
});

describe('LoansService.retryReceiptPdf', () => {
  let receiptsRepository: { findById: jest.Mock };
  let eventEmitter: { emit: jest.Mock; emitAsync: jest.Mock };
  let service: LoansService;

  beforeEach(() => {
    receiptsRepository = { findById: jest.fn() };
    eventEmitter = {
      emit: jest.fn(),
      emitAsync: jest.fn().mockResolvedValue([]),
    };
    service = new LoansService(
      {} as any,
      {} as any,
      {} as any,
      eventEmitter as any,
      receiptsRepository as any,
      {} as any,
    );
  });

  it('asks for the missing PDFs and returns the receipt once they exist', async () => {
    receiptsRepository.findById
      .mockResolvedValueOnce(
        receipt({ interestInvoice: { id: 'inv-1', pdfFileId: null } }),
      )
      .mockResolvedValueOnce(
        receipt({
          pdfFileId: 'file-1',
          interestInvoice: { id: 'inv-1', pdfFileId: 'file-2' },
        }),
      );

    const result = await service.retryReceiptPdf(
      'tenant-1',
      'receipt-1',
      'user-1',
    );

    expect(receiptsRepository.findById).toHaveBeenCalledWith(
      'tenant-1',
      'receipt-1',
    );
    expect(eventEmitter.emitAsync).toHaveBeenCalledWith(
      'payment.receipt.pdf.requested',
      { tenantId: 'tenant-1', receiptId: 'receipt-1' },
    );
    expect(result.pdfFileId).toBe('file-1');
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'audit.log',
      expect.objectContaining({
        action: 'payment.receipt.pdf.regenerated',
        userId: 'user-1',
        resourceId: 'receipt-1',
      }),
    );
  });

  it('does nothing when every PDF of the payment already exists', async () => {
    receiptsRepository.findById.mockResolvedValue(
      receipt({
        pdfFileId: 'file-1',
        interestInvoice: { id: 'inv-1', pdfFileId: 'file-2' },
      }),
    );

    await service.retryReceiptPdf('tenant-1', 'receipt-1');

    expect(eventEmitter.emitAsync).not.toHaveBeenCalled();
  });

  it('retries a missing interest invoice PDF even if the receipt PDF exists', async () => {
    receiptsRepository.findById
      .mockResolvedValueOnce(
        receipt({
          pdfFileId: 'file-1',
          interestInvoice: { id: 'inv-1', pdfFileId: null },
        }),
      )
      .mockResolvedValueOnce(
        receipt({
          pdfFileId: 'file-1',
          interestInvoice: { id: 'inv-1', pdfFileId: 'file-2' },
        }),
      );

    await service.retryReceiptPdf('tenant-1', 'receipt-1');

    expect(eventEmitter.emitAsync).toHaveBeenCalledTimes(1);
  });

  it('reports a failure when the PDF is still missing after retrying', async () => {
    receiptsRepository.findById.mockResolvedValue(receipt());

    await expect(
      service.retryReceiptPdf('tenant-1', 'receipt-1'),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(eventEmitter.emit).not.toHaveBeenCalledWith(
      'audit.log',
      expect.anything(),
    );
  });

  it('does not touch a receipt of another tenant', async () => {
    receiptsRepository.findById.mockResolvedValue(null);

    await expect(
      service.retryReceiptPdf('tenant-2', 'receipt-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(eventEmitter.emitAsync).not.toHaveBeenCalled();
  });
});
