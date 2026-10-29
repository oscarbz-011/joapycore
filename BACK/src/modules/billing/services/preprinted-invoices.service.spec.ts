import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PreprintedInvoicesService } from './preprinted-invoices.service';

const tx = { marker: 'tx' };

function makeInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inv-1',
    modality: 'PREPRINTED',
    status: 'ISSUED',
    invoiceType: 'SALE',
    sequential: 41,
    seriesId: 'series-1',
    formPrintCount: 0,
    formPrintedAt: null,
    physicalScan: null,
    series: { printLayout: null },
    invoicePrefix: '001-002-',
    invoiceNumber: '0000041',
    timbrado: '12345678',
    timbradoValidFrom: new Date('2026-01-01T00:00:00.000Z'),
    timbradoValidUntil: new Date('2026-12-31T00:00:00.000Z'),
    issuedAt: new Date('2026-06-15T15:00:00.000Z'),
    total: 110_000,
    anonymousBuyer: true,
    tenant: {
      name: 'Mi Empresa',
      razonSocial: 'Mi Empresa S.A.',
      nombreFantasia: null,
      ruc: '80069563-1',
      address: null,
      numeroCasa: null,
      city: null,
      phone: null,
      actividadesEconomicas: [],
    },
    saleOrder: null,
    paymentReceipt: null,
    items: [
      {
        description: 'Ventilador',
        quantity: 1,
        unitPrice: 110_000,
        total: 110_000,
        ivaRate: 10,
        ivaAmount: 10_000,
      },
    ],
    ...overrides,
  };
}

const NEXT_SHEET = {
  seriesId: 'series-1',
  modality: 'PREPRINTED' as const,
  timbrado: '12345678',
  timbradoValidFrom: null,
  timbradoValidUntil: null,
  serieCode: '',
  establecimiento: '001',
  puntoExpedicion: '002',
  sequential: 42,
  invoiceNumber: '0000042',
  invoicePrefix: '001-002-',
};

describe('PreprintedInvoicesService', () => {
  let invoices: {
    findForForm: jest.Mock;
    findById: jest.Mock;
    recordFormPrint: jest.Mock;
    moveToSheet: jest.Mock;
    setPhysicalScan: jest.Mock;
  };
  let series: {
    numberForPreprintedSheet: jest.Mock;
    recordVoidedSheet: jest.Mock;
    voidLooseSheet: jest.Mock;
    findVoided: jest.Mock;
  };
  let files: { getById: jest.Mock };
  let events: { emit: jest.Mock };
  let prisma: { $transaction: jest.Mock };
  let service: PreprintedInvoicesService;

  beforeEach(() => {
    invoices = {
      findForForm: jest.fn().mockResolvedValue(makeInvoice()),
      findById: jest.fn().mockResolvedValue({ id: 'inv-1' }),
      recordFormPrint: jest.fn().mockResolvedValue({ count: 1 }),
      moveToSheet: jest.fn().mockResolvedValue({ count: 1 }),
      setPhysicalScan: jest.fn().mockResolvedValue({ count: 1 }),
    };
    series = {
      numberForPreprintedSheet: jest.fn().mockResolvedValue(NEXT_SHEET),
      recordVoidedSheet: jest.fn().mockResolvedValue(undefined),
      voidLooseSheet: jest.fn().mockResolvedValue(undefined),
      findVoided: jest.fn().mockResolvedValue([]),
    };
    files = { getById: jest.fn().mockResolvedValue({ id: 'file-1' }) };
    events = { emit: jest.fn() };
    prisma = { $transaction: jest.fn().mockImplementation((cb) => cb(tx)) };
    service = new PreprintedInvoicesService(
      prisma as any,
      invoices as any,
      series as any,
      files as any,
      events as any,
    );
  });

  describe('print', () => {
    it('returns what goes on the sheet and records the print', async () => {
      const result = await service.print('tenant-1', 'inv-1', 'user-1');

      expect(invoices.recordFormPrint).toHaveBeenCalledWith(
        'tenant-1',
        'inv-1',
        expect.any(Date),
      );
      expect(result.printCount).toBe(1);
      expect(result.receipt).toMatchObject({
        number: '001-002-0000041',
        buyer: { name: 'Sin Nombre', document: 'X' },
        formLayout: expect.objectContaining({ items: expect.any(Object) }),
      });
      expect(events.emit).toHaveBeenCalledWith(
        'audit.log',
        expect.objectContaining({
          action: 'invoice.form.printed',
          after: { sheet: 41, printNumber: 1 },
        }),
      );
    });

    it('counts a reprint on the same sheet', async () => {
      invoices.findForForm.mockResolvedValue(
        makeInvoice({ formPrintCount: 2 }),
      );
      await expect(service.print('tenant-1', 'inv-1')).resolves.toMatchObject({
        printCount: 3,
      });
    });

    it.each([
      [
        'a self-printed invoice',
        { modality: 'SELF_PRINTED' },
        'Solo las facturas numeradas',
      ],
      [
        'an unnumbered invoice',
        { sequential: null },
        'Solo las facturas numeradas',
      ],
      ['a draft', { status: 'PENDING' }, 'todavía no fue emitida'],
      ['a cancelled invoice', { status: 'CANCELLED' }, 'está cancelada'],
    ])('does not print %s', async (_label, overrides, message) => {
      invoices.findForForm.mockResolvedValue(makeInvoice(overrides));
      await expect(service.print('tenant-1', 'inv-1')).rejects.toThrow(message);
      expect(invoices.recordFormPrint).not.toHaveBeenCalled();
    });

    it('does not find an invoice of another tenant', async () => {
      invoices.findForForm.mockResolvedValue(null);
      await expect(service.print('tenant-2', 'inv-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(invoices.findForForm).toHaveBeenCalledWith('tenant-2', 'inv-1');
    });
  });

  describe('voidSheet', () => {
    it('voids the damaged sheet and moves the invoice to the next one in one transaction', async () => {
      await service.voidSheet(
        'tenant-1',
        'inv-1',
        { reason: 'Se trabó el papel', scanFileId: 'file-1' },
        'user-1',
      );

      expect(series.numberForPreprintedSheet).toHaveBeenCalledWith(
        'tenant-1',
        {
          seriesId: 'series-1',
          documentNumber: undefined,
          at: makeInvoice().issuedAt,
        },
        tx,
      );
      expect(invoices.moveToSheet).toHaveBeenCalledWith(
        'tenant-1',
        'inv-1',
        41,
        NEXT_SHEET,
        tx,
      );
      expect(series.recordVoidedSheet).toHaveBeenCalledWith(
        'tenant-1',
        {
          seriesId: 'series-1',
          sequential: 41,
          invoiceId: 'inv-1',
          reason: 'Se trabó el papel',
          scanFileId: 'file-1',
          userId: 'user-1',
        },
        tx,
      );
      expect(events.emit).toHaveBeenCalledWith(
        'audit.log',
        expect.objectContaining({ action: 'invoice.sheet.voided' }),
      );
    });

    it('uses the sheet the user chose', async () => {
      await service.voidSheet('tenant-1', 'inv-1', {
        reason: 'Salió corrida',
        documentNumber: 45,
      });
      expect(series.numberForPreprintedSheet).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({ documentNumber: 45 }),
        tx,
      );
    });

    it('explains a sheet already taken by someone else', async () => {
      prisma.$transaction.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );
      await expect(
        service.voidSheet('tenant-1', 'inv-1', {
          reason: 'Salió corrida',
          documentNumber: 45,
        }),
      ).rejects.toThrow('Esa hoja ya fue usada o inutilizada');
    });

    it('does not void when the invoice changed meanwhile', async () => {
      invoices.moveToSheet.mockResolvedValue({ count: 0 });
      await expect(
        service.voidSheet('tenant-1', 'inv-1', { reason: 'Salió corrida' }),
      ).rejects.toThrow('La factura cambió mientras tanto');
      expect(series.recordVoidedSheet).not.toHaveBeenCalled();
    });

    it('rejects a scan of another tenant', async () => {
      files.getById.mockRejectedValue(new NotFoundException());
      await expect(
        service.voidSheet('tenant-1', 'inv-1', {
          reason: 'Salió corrida',
          scanFileId: 'foreign',
        }),
      ).rejects.toThrow('El archivo adjunto no existe');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('setPhysicalScan', () => {
    it('attaches the scan of the physical invoice', async () => {
      await service.setPhysicalScan('tenant-1', 'inv-1', 'file-1', 'user-1');
      expect(files.getById).toHaveBeenCalledWith('tenant-1', 'file-1');
      expect(invoices.setPhysicalScan).toHaveBeenCalledWith(
        'tenant-1',
        'inv-1',
        'file-1',
      );
    });

    it('removes it', async () => {
      await service.setPhysicalScan('tenant-1', 'inv-1', null);
      expect(files.getById).not.toHaveBeenCalled();
      expect(invoices.setPhysicalScan).toHaveBeenCalledWith(
        'tenant-1',
        'inv-1',
        null,
      );
    });
  });

  describe('voidLooseSheet', () => {
    it('voids a blank sheet of the talonario', async () => {
      await service.voidLooseSheet(
        'tenant-1',
        'series-1',
        { documentNumber: 60, reason: 'Hoja extraviada' },
        'user-1',
      );
      expect(series.voidLooseSheet).toHaveBeenCalledWith(
        'tenant-1',
        'series-1',
        { documentNumber: 60, reason: 'Hoja extraviada', userId: 'user-1' },
        tx,
      );
      expect(series.findVoided).toHaveBeenCalledWith('tenant-1', 'series-1');
    });

    it('explains a number already used', async () => {
      prisma.$transaction.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );
      await expect(
        service.voidLooseSheet('tenant-1', 'series-1', {
          documentNumber: 60,
          reason: 'Hoja extraviada',
        }),
      ).rejects.toThrow(
        'El número 60 del talonario ya fue usado o inutilizado',
      );
    });
  });
});
