import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RemissionNotesService } from './remission-notes.service';

const TODAY = new Date().toISOString().slice(0, 10);
const tx = { tx: true };

const transport = {
  type: 'OWN' as const,
  vehicleBrand: 'Toyota',
  vehiclePlate: 'aaa123',
  carrierName: 'Electro SA',
  carrierRuc: '80000001-1',
  carrierAddress: 'Mcal. López 100',
  driverName: 'Juan Pérez',
  driverDocument: '1234567',
  driverAddress: 'Luque',
  startDate: TODAY,
  endDate: TODAY,
};
const place = {
  address: 'Mcal. López 100',
  city: 'Asunción',
  department: 'Capital',
};

const transferDto = () => ({
  fromWarehouseId: 'wh-a',
  toWarehouseId: 'wh-b',
  items: [
    { productId: 'p-rice', quantity: 3 },
    { productId: 'p-tv', quantity: 1, serialNumbers: ['SN-1'] },
  ],
  origin: place,
  destination: {
    ...place,
    address: 'Ruta 2 km 20',
    city: 'Capiatá',
    department: 'Central',
  },
  transport,
});

const saleDto = () => ({
  recipientName: 'María Pérez',
  recipientDocument: 'CI 1234567',
  items: [{ invoiceItemId: 'ii-tv', quantity: 1, serialNumbers: ['SN-2'] }],
  origin: place,
  destination: { ...place, address: 'Barrio Obrero' },
  transport: { ...transport, type: 'THIRD_PARTY' as const },
});

const numbering = (
  modality: 'SELF_PRINTED' | 'PREPRINTED' = 'SELF_PRINTED',
) => ({
  seriesId: 'series-rn',
  modality,
  timbrado: '12345678',
  timbradoValidFrom: new Date('2026-01-01'),
  timbradoValidUntil: new Date('2027-12-31'),
  serieCode: '',
  establecimiento: '001',
  puntoExpedicion: '002',
  sequential: 7,
  invoiceNumber: '0000007',
  invoicePrefix: '001-002-',
});

const invoice = (overrides: Record<string, unknown> = {}) => ({
  id: 'inv-1',
  status: 'ISSUED',
  invoiceType: 'SALE',
  anonymousBuyer: false,
  invoicePrefix: '001-001-',
  invoiceNumber: '0000009',
  timbrado: '87654321',
  issuedAt: new Date('2026-11-01'),
  series: { branchId: 'br-1' },
  saleOrder: {
    branchId: 'br-1',
    customer: {
      id: 'c-1',
      firstName: 'María',
      secondFirstName: null,
      lastName: 'Pérez',
      secondLastName: null,
      documentType: 'CI',
      documentNumber: '1234567',
      taxpayerType: 'INDIVIDUAL',
      address: 'Barrio Obrero',
      city: 'Asunción',
    },
  },
  items: [
    {
      id: 'ii-tv',
      description: 'Televisor',
      quantity: 2,
      saleOrderItemId: 'soi-tv',
    },
    {
      id: 'ii-install',
      description: 'Instalación',
      quantity: 1,
      saleOrderItemId: 'soi-install',
    },
  ],
  ...overrides,
});

describe('RemissionNotesService', () => {
  let service: RemissionNotesService;
  let prisma: { $transaction: jest.Mock };
  let notes: Record<string, jest.Mock>;
  let invoices: { findForRemission: jest.Mock };
  let sources: Record<string, jest.Mock>;
  let events: { record: jest.Mock; findByRemissionNote: jest.Mock };
  let series: { numberForIssue: jest.Mock; findIssueOptions: jest.Mock };
  let outbox: { enqueue: jest.Mock; dispatch: jest.Mock };
  let eventBus: { emit: jest.Mock };
  let stockLedger: { transfer: jest.Mock };

  beforeEach(() => {
    prisma = { $transaction: jest.fn((fn: (t: unknown) => unknown) => fn(tx)) };
    notes = {
      createWithItems: jest.fn().mockResolvedValue({ id: 'ignored' }),
      findById: jest.fn().mockResolvedValue({ id: 'rn-1', status: 'ISSUED' }),
      remittedQuantities: jest.fn().mockResolvedValue(new Map()),
      voidIfIssued: jest.fn().mockResolvedValue({ count: 1 }),
      findAll: jest.fn(),
      findByInvoice: jest.fn(),
    };
    invoices = { findForRemission: jest.fn().mockResolvedValue(invoice()) };
    sources = {
      findWarehousesForRemission: jest.fn().mockResolvedValue([
        {
          id: 'wh-a',
          name: 'Central',
          isActive: true,
          address: null,
          branch: { id: 'br-1', name: 'Centro' },
        },
        {
          id: 'wh-b',
          name: 'Capiatá',
          isActive: true,
          address: null,
          branch: { id: 'br-2', name: 'Capiatá' },
        },
      ]),
      findProductsForRemission: jest.fn().mockResolvedValue([
        {
          id: 'p-rice',
          name: 'Arroz',
          model: null,
          unit: 'kg',
          isSerialized: false,
          brand: null,
        },
        {
          id: 'p-tv',
          name: 'Televisor',
          model: null,
          unit: 'unidad',
          isSerialized: true,
          brand: { name: 'LG' },
        },
      ]),
      findTenantForRemission: jest.fn().mockResolvedValue({
        name: 'Electro',
        razonSocial: 'Electro SA',
        ruc: '80000001-1',
        address: 'Mcal. López',
        numeroCasa: '100',
        city: 'Asunción',
      }),
      findSaleItemsForRemission: jest.fn().mockResolvedValue([
        {
          id: 'soi-tv',
          productId: 'p-tv',
          product: {
            name: 'Televisor',
            model: null,
            unit: 'unidad',
            isSerialized: true,
            brand: null,
          },
        },
        { id: 'soi-install', productId: null, product: null },
      ]),
      findSerialsBySaleItems: jest
        .fn()
        .mockResolvedValue(new Map([['soi-tv', ['SN-1', 'SN-2']]])),
      findBranchForRemission: jest.fn().mockResolvedValue({
        id: 'br-1',
        name: 'Centro',
        address: 'Palma',
        numeroCasa: '500',
        city: null,
        ciudadDesc: 'ASUNCION (DISTRITO)',
        departamentoDesc: 'CAPITAL',
      }),
    };
    events = {
      record: jest.fn(),
      findByRemissionNote: jest.fn().mockResolvedValue([]),
    };
    series = {
      numberForIssue: jest.fn().mockResolvedValue(numbering()),
      findIssueOptions: jest.fn().mockResolvedValue([]),
    };
    outbox = {
      enqueue: jest.fn().mockResolvedValue('evt-1'),
      dispatch: jest.fn(),
    };
    eventBus = { emit: jest.fn() };
    stockLedger = { transfer: jest.fn() };
    service = new RemissionNotesService(
      prisma as any,
      notes as any,
      invoices as any,
      sources as any,
      events as any,
      series as any,
      { generate: jest.fn() } as any,
      { getById: jest.fn() } as any,
      outbox as any,
      eventBus as any,
      stockLedger as any,
    );
  });

  const createdNote = () => notes.createWithItems.mock.calls[0][0];

  describe('transfer between branches', () => {
    it('numbers from the origin branch, moves the stock and requests the PDF', async () => {
      await service.issueTransfer('tenant-1', transferDto(), 'user-1');

      expect(series.numberForIssue).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({
          branchId: 'br-1',
          documentType: 'REMISSION_NOTE',
        }),
        tx,
      );
      const note = createdNote();
      expect(note).toEqual(
        expect.objectContaining({
          tenantId: 'tenant-1',
          branchId: 'br-1',
          motive: 'BRANCH_TRANSFER',
          recipientName: 'Electro SA',
          recipientDocument: 'RUC 80000001-1',
          fromWarehouseId: 'wh-a',
          toWarehouseId: 'wh-b',
          vehiclePlate: 'AAA123',
          number: '0000007',
          numberPrefix: '001-002-',
          timbrado: '12345678',
        }),
      );
      expect(notes.createWithItems.mock.calls[0][1]).toEqual([
        expect.objectContaining({
          productId: 'p-rice',
          unit: 'kg',
          quantity: 3,
        }),
        expect.objectContaining({
          description: 'Televisor LG',
          serialNumbers: ['SN-1'],
        }),
      ]);
      expect(stockLedger.transfer).toHaveBeenCalledWith(tx, 'tenant-1', {
        referenceId: note.id,
        fromWarehouseId: 'wh-a',
        toWarehouseId: 'wh-b',
        notes: 'Nota de remisión 001-002-0000007',
        lines: [
          { productId: 'p-rice', quantity: 3, serialNumbers: [] },
          { productId: 'p-tv', quantity: 1, serialNumbers: ['SN-1'] },
        ],
      });
      expect(events.record).toHaveBeenCalledWith(
        expect.objectContaining({
          remissionNoteId: note.id,
          invoiceId: null,
          type: 'REMISSION_NOTE_ISSUED',
        }),
        tx,
      );
      expect(outbox.enqueue).toHaveBeenCalledWith(
        tx,
        'tenant-1',
        'remission-note.pdf.requested',
        {
          tenantId: 'tenant-1',
          remissionNoteId: note.id,
          requestedById: 'user-1',
        },
      );
      expect(outbox.dispatch).toHaveBeenCalledWith('evt-1');
    });

    it('does not generate a PDF for a talonario note', async () => {
      series.numberForIssue.mockResolvedValue(numbering('PREPRINTED'));
      await service.issueTransfer('tenant-1', {
        ...transferDto(),
        documentNumber: 7,
      });
      expect(outbox.enqueue).not.toHaveBeenCalled();
    });

    it('rejects a warehouse of another company', async () => {
      sources.findWarehousesForRemission.mockResolvedValue([]);
      await expect(
        service.issueTransfer('tenant-1', transferDto() as any),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(stockLedger.transfer).not.toHaveBeenCalled();
    });

    it('asks for the branch of the origin warehouse', async () => {
      sources.findWarehousesForRemission.mockResolvedValue([
        {
          id: 'wh-a',
          name: 'Galpón',
          isActive: true,
          address: null,
          branch: null,
        },
        {
          id: 'wh-b',
          name: 'Capiatá',
          isActive: true,
          address: null,
          branch: { id: 'br-2', name: 'Capiatá' },
        },
      ]);
      await expect(
        service.issueTransfer('tenant-1', transferDto() as any),
      ).rejects.toThrow('no pertenece a una sucursal');
    });

    it('asks for the RUC of the company', async () => {
      sources.findTenantForRemission.mockResolvedValue({
        name: 'Electro',
        ruc: null,
      });
      await expect(
        service.issueTransfer('tenant-1', transferDto() as any),
      ).rejects.toThrow('RUC de la empresa');
    });

    it('rejects a transport that started yesterday before opening a transaction', async () => {
      const yesterday = new Date(Date.now() - 2 * 86_400_000)
        .toISOString()
        .slice(0, 10);
      await expect(
        service.issueTransfer('tenant-1', {
          ...transferDto(),
          transport: { ...transport, startDate: yesterday },
        } as any),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('turns a repeated number into a conflict', async () => {
      notes.createWithItems.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: 'x',
        }),
      );
      await expect(
        service.issueTransfer('tenant-1', transferDto() as any),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('sale', () => {
    it('documents the shipment of the invoice without moving stock', async () => {
      await service.issueForSale('tenant-1', 'inv-1', saleDto(), 'user-1');

      expect(createdNote()).toEqual(
        expect.objectContaining({
          motive: 'SALE',
          invoiceId: 'inv-1',
          customerId: 'c-1',
          recipientName: 'María Pérez',
          transportType: 'THIRD_PARTY',
          fromWarehouseId: null,
        }),
      );
      expect(notes.createWithItems.mock.calls[0][1]).toEqual([
        expect.objectContaining({
          invoiceItemId: 'ii-tv',
          serialNumbers: ['SN-2'],
        }),
      ]);
      expect(stockLedger.transfer).not.toHaveBeenCalled();
      expect(events.record).toHaveBeenCalledWith(
        expect.objectContaining({
          invoiceId: 'inv-1',
          type: 'REMISSION_NOTE_ISSUED',
        }),
        tx,
      );
    });

    it.each([
      [{ status: 'PENDING' }, 'todavía no se emitió'],
      [{ status: 'CANCELLED' }, 'anulada'],
      [{ invoiceType: 'INTEREST' }, 'Solo una factura de venta'],
    ])('rejects an invoice %j', async (overrides, message) => {
      invoices.findForRemission.mockResolvedValue(invoice(overrides));
      await expect(
        service.issueForSale('tenant-1', 'inv-1', saleDto() as any),
      ).rejects.toThrow(message);
    });

    it('does not send what already went out', async () => {
      notes.remittedQuantities.mockResolvedValue(new Map([['ii-tv', 2]]));
      await expect(
        service.issueForSale('tenant-1', 'inv-1', saleDto() as any),
      ).rejects.toThrow('ya se envió completo');
    });

    it('rejects an invoice of another company', async () => {
      invoices.findForRemission.mockResolvedValue(null);
      await expect(
        service.issueForSale('tenant-1', 'inv-x', saleDto() as any),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('suggests the recipient, the places and only the goods', async () => {
      const options = await service.saleOptions('tenant-1', 'inv-1');
      expect(options.recipient).toEqual({
        name: 'María Pérez',
        document: 'CI 1234567',
      });
      expect(options.origin).toEqual({
        address: 'Palma 500',
        city: 'ASUNCION (DISTRITO)',
        department: 'CAPITAL',
      });
      expect(options.destination.address).toBe('Barrio Obrero');
      expect(options.items.map((i) => i.invoiceItemId)).toEqual(['ii-tv']);
      expect(series.findIssueOptions).toHaveBeenCalledWith(
        'tenant-1',
        'br-1',
        expect.any(Date),
        'REMISSION_NOTE',
      );
    });

    it('leaves the recipient empty for a "Sin Nombre" invoice', async () => {
      invoices.findForRemission.mockResolvedValue(
        invoice({ anonymousBuyer: true }),
      );
      const options = await service.saleOptions('tenant-1', 'inv-1');
      expect(options.recipient).toEqual({ name: '', document: '' });
    });
  });

  describe('void', () => {
    const transferNote = {
      id: 'rn-1',
      status: 'ISSUED',
      motive: 'BRANCH_TRANSFER',
      numberPrefix: '001-002-',
      number: '0000007',
      invoice: null,
      fromWarehouse: { id: 'wh-a' },
      toWarehouse: { id: 'wh-b' },
      items: [
        { productId: 'p-tv', quantity: 1, serialNumbers: ['SN-1'] },
        { productId: null, quantity: 1, serialNumbers: [] },
      ],
    };

    it('brings the goods of a transfer back to the origin', async () => {
      notes.findById.mockResolvedValue(transferNote);
      await service.voidNote(
        'tenant-1',
        'rn-1',
        { reason: 'El camión no salió' },
        'user-1',
      );
      expect(notes.voidIfIssued).toHaveBeenCalledWith(
        'tenant-1',
        'rn-1',
        expect.objectContaining({
          reason: 'El camión no salió',
          userId: 'user-1',
        }),
        tx,
      );
      expect(stockLedger.transfer).toHaveBeenCalledWith(tx, 'tenant-1', {
        referenceId: 'rn-1',
        fromWarehouseId: 'wh-b',
        toWarehouseId: 'wh-a',
        notes: 'Anulación de la nota de remisión 001-002-0000007',
        lines: [{ productId: 'p-tv', quantity: 1, serialNumbers: ['SN-1'] }],
      });
      expect(events.record).toHaveBeenCalledWith(
        expect.objectContaining({ remissionNoteId: 'rn-1', type: 'VOIDED' }),
        tx,
      );
    });

    it('does not move stock for a sale', async () => {
      notes.findById.mockResolvedValue({
        ...transferNote,
        motive: 'SALE',
        invoice: { id: 'inv-1' },
      });
      await service.voidNote('tenant-1', 'rn-1', { reason: 'Se reprogramó' });
      expect(stockLedger.transfer).not.toHaveBeenCalled();
      expect(events.record).toHaveBeenCalledWith(
        expect.objectContaining({ invoiceId: 'inv-1', type: 'VOIDED' }),
        tx,
      );
    });

    it('rejects a voided note and a concurrent void', async () => {
      notes.findById.mockResolvedValue({ ...transferNote, status: 'VOIDED' });
      await expect(
        service.voidNote('tenant-1', 'rn-1', { reason: 'Otra vez' }),
      ).rejects.toThrow('ya está anulada');
      notes.findById.mockResolvedValue(transferNote);
      notes.voidIfIssued.mockResolvedValue({ count: 0 });
      await expect(
        service.voidNote('tenant-1', 'rn-1', { reason: 'Otra vez' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(stockLedger.transfer).not.toHaveBeenCalled();
    });

    it('rejects a note of another company', async () => {
      notes.findById.mockResolvedValue(null);
      await expect(
        service.voidNote('tenant-1', 'rn-x', { reason: 'No existe' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  it('offers the warehouses with the address of their branch', async () => {
    sources.findWarehousesForRemission.mockResolvedValue([
      {
        id: 'wh-a',
        name: 'Central',
        isActive: true,
        address: 'Galpón 3',
        branch: {
          id: 'br-1',
          name: 'Centro',
          address: 'Palma',
          numeroCasa: '500',
          city: 'Asunción',
          ciudadDesc: null,
          departamentoDesc: 'CAPITAL',
        },
      },
    ]);
    const options = await service.transferOptions('tenant-1');
    expect(options.company).toEqual({
      name: 'Electro SA',
      ruc: '80000001-1',
      address: 'Mcal. López, 100, Asunción',
    });
    expect(options.warehouses[0]).toEqual({
      id: 'wh-a',
      name: 'Central',
      branch: { id: 'br-1', name: 'Centro' },
      place: { address: 'Galpón 3', city: 'Asunción', department: 'CAPITAL' },
    });
  });
});
