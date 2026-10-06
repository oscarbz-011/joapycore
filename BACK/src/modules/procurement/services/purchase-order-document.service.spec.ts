import {
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PurchaseOrderDocumentService } from './purchase-order-document.service';

function makeOrder(overrides = {}) {
  return {
    id: 'po-1',
    orderNumber: 'OC-26-000007',
    pdfFileId: null as string | null,
    supplier: { id: 'sup-1', name: 'Importadora B', email: 'roman@mail.com' },
    ...overrides,
  };
}

describe('PurchaseOrderDocumentService', () => {
  let service: PurchaseOrderDocumentService;
  let repository: { findById: jest.Mock };
  let filesService: { getById: jest.Mock; getFileBuffer: jest.Mock };
  let emailService: { sendWithAttachment: jest.Mock };
  let eventEmitter: { emit: jest.Mock; emitAsync: jest.Mock };

  beforeEach(() => {
    repository = { findById: jest.fn() };
    filesService = {
      getById: jest.fn().mockResolvedValue({
        id: 'file-1',
        originalName: 'orden-de-compra-OC-26-000007.pdf',
        mimeType: 'application/pdf',
      }),
      getFileBuffer: jest.fn().mockResolvedValue(Buffer.from('pdf')),
    };
    emailService = {
      sendWithAttachment: jest.fn().mockResolvedValue({
        to: 'roman@mail.com',
        messageId: 'm-1',
        accepted: ['roman@mail.com'],
      }),
    };
    eventEmitter = {
      emit: jest.fn(),
      emitAsync: jest.fn().mockResolvedValue([]),
    };
    service = new PurchaseOrderDocumentService(
      repository as never,
      filesService as never,
      emailService as never,
      eventEmitter as never,
    );
  });

  describe('ensurePdf', () => {
    it('asks for the PDF and returns the order once it exists', async () => {
      repository.findById
        .mockResolvedValueOnce(makeOrder())
        .mockResolvedValueOnce(makeOrder({ pdfFileId: 'file-1' }));

      const order = await service.ensurePdf('tenant-1', 'po-1', 'user-1');

      expect(eventEmitter.emitAsync).toHaveBeenCalledWith(
        'purchase.order.pdf.requested',
        {
          tenantId: 'tenant-1',
          purchaseOrderId: 'po-1',
          requestedById: 'user-1',
        },
      );
      expect(order.pdfFileId).toBe('file-1');
    });

    it('does not generate it again when the order already has one', async () => {
      repository.findById.mockResolvedValue(makeOrder({ pdfFileId: 'file-1' }));

      await service.ensurePdf('tenant-1', 'po-1');

      expect(eventEmitter.emitAsync).not.toHaveBeenCalled();
    });

    it('reports a failure when the PDF is still missing', async () => {
      repository.findById.mockResolvedValue(makeOrder());

      await expect(
        service.ensurePdf('tenant-1', 'po-1'),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('does not reveal an order of another tenant', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(
        service.ensurePdf('tenant-2', 'po-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repository.findById).toHaveBeenCalledWith('tenant-2', 'po-1');
      expect(eventEmitter.emitAsync).not.toHaveBeenCalled();
    });
  });

  describe('emailToSupplier', () => {
    beforeEach(() => {
      repository.findById.mockResolvedValue(makeOrder({ pdfFileId: 'file-1' }));
    });

    it('sends the PDF to the supplier and audits it', async () => {
      const result = await service.emailToSupplier(
        'tenant-1',
        'po-1',
        undefined,
        'user-1',
      );

      expect(filesService.getById).toHaveBeenCalledWith('tenant-1', 'file-1');
      expect(emailService.sendWithAttachment).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          to: 'roman@mail.com',
          subject: 'Orden de compra OC-26-000007',
          attachment: expect.objectContaining({
            filename: 'orden-de-compra-OC-26-000007.pdf',
            contentType: 'application/pdf',
          }),
        }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'audit.log',
        expect.objectContaining({
          action: 'purchase.order.emailed',
          resourceId: 'po-1',
          after: { to: 'roman@mail.com' },
        }),
      );
      expect(result).toEqual({
        to: 'roman@mail.com',
        accepted: ['roman@mail.com'],
      });
    });

    it('sends to another address when one is given', async () => {
      await service.emailToSupplier('tenant-1', 'po-1', ' ventas@otro.com ');

      expect(emailService.sendWithAttachment).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'ventas@otro.com' }),
      );
    });

    it('asks for an address when the supplier has no email', async () => {
      repository.findById.mockResolvedValue(
        makeOrder({
          pdfFileId: 'file-1',
          supplier: { id: 'sup-1', name: 'Importadora B', email: null },
        }),
      );

      await expect(
        service.emailToSupplier('tenant-1', 'po-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(emailService.sendWithAttachment).not.toHaveBeenCalled();
    });

    it('does not audit a delivery that failed', async () => {
      emailService.sendWithAttachment.mockRejectedValue(new Error('smtp down'));

      await expect(service.emailToSupplier('tenant-1', 'po-1')).rejects.toThrow(
        'smtp down',
      );
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });
  });
});
