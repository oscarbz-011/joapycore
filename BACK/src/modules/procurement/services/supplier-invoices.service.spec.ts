import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { SupplierInvoicesService } from './supplier-invoices.service';

// Recepción de 10 × 100.000 = 1.000.000, estimada en la cuenta ap-1.
function makePayable(overrides = {}) {
  return {
    id: 'ap-1',
    amount: 1_000_000,
    paidAmount: 0,
    status: 'PENDING',
    purchaseReceipt: {
      id: 'rec-1',
      items: [{ id: 'ri-1', quantity: 10, unitCost: 100_000 }],
    },
    ...overrides,
  };
}

function makeInvoice(overrides = {}) {
  return {
    id: 'inv-1',
    status: 'PENDING_APPROVAL',
    invoiceDate: new Date('2026-10-07T00:00:00.000Z'),
    shippingAmount: 0,
    discountAmount: 0,
    supplier: { id: 'sup-1', name: 'Importadora A', paymentTermDays: 30 },
    items: [
      {
        purchaseReceiptItemId: 'ri-1',
        accountsPayableId: 'ap-1',
        quantity: 10,
        unitCost: 100_000,
        receivedQuantity: 10,
        receivedUnitCost: 100_000,
      },
    ],
    ...overrides,
  };
}

interface DtoOverrides {
  lines?: {
    purchaseReceiptItemId: string;
    quantity: number;
    unitCost: number;
  }[];
  shippingAmount?: number;
  discountAmount?: number;
  total?: number;
  fileId?: string;
}

// El total que figura en la factura cierra con sus líneas, salvo que el test
// diga otra cosa.
const dto = (overrides: DtoOverrides = {}) => {
  const lines = overrides.lines ?? [
    { purchaseReceiptItemId: 'ri-1', quantity: 10, unitCost: 100_000 },
  ];
  return {
    supplierId: 'sup-1',
    payableIds: ['ap-1'],
    invoiceNumber: ' 001-001-0000123 ',
    invoiceDate: '2026-10-07',
    total:
      lines.reduce((sum, line) => sum + line.quantity * line.unitCost, 0) +
      (overrides.shippingAmount ?? 0) -
      (overrides.discountAmount ?? 0),
    ...overrides,
    lines,
  };
};

describe('SupplierInvoicesService', () => {
  let service: SupplierInvoicesService;
  let invoices: {
    findInvoiceablePayables: jest.Mock;
    findActiveByNumber: jest.Mock;
    findById: jest.Mock;
    create: jest.Mock;
    linkPayables: jest.Mock;
    unlinkPayables: jest.Mock;
    setFile: jest.Mock;
    transition: jest.Mock;
    lockPayables: jest.Mock;
    updatePayable: jest.Mock;
  };
  let eventEmitter: { emit: jest.Mock };
  let files: { getById: jest.Mock };
  const tx = { tx: true };

  beforeEach(() => {
    invoices = {
      findInvoiceablePayables: jest.fn().mockResolvedValue([makePayable()]),
      findActiveByNumber: jest.fn().mockResolvedValue(null),
      findById: jest.fn().mockResolvedValue(makeInvoice()),
      create: jest.fn().mockResolvedValue({ id: 'inv-1' }),
      linkPayables: jest.fn().mockResolvedValue(1),
      unlinkPayables: jest.fn(),
      setFile: jest.fn(),
      transition: jest.fn().mockResolvedValue(1),
      lockPayables: jest.fn().mockResolvedValue([
        {
          id: 'ap-1',
          amount: 1_000_000,
          estimatedAmount: null,
          paidAmount: 0,
          advanceApplied: 0,
        },
      ]),
      updatePayable: jest.fn(),
    };
    eventEmitter = { emit: jest.fn() };
    files = {
      getById: jest.fn().mockResolvedValue({ mimeType: 'application/pdf' }),
    };
    service = new SupplierInvoicesService(
      { $transaction: jest.fn((cb) => cb(tx)) } as never,
      invoices as never,
      eventEmitter as never,
      files as never,
    );
  });

  const created = () =>
    invoices.create.mock.calls[0][0] as {
      status: string;
      total: number;
      invoiceNumber: string;
      items: { create: unknown[] };
    };

  describe('create', () => {
    it('applies itself when the invoice says what was received', async () => {
      await service.create('tenant-1', dto(), 'user-1');

      expect(invoices.findInvoiceablePayables).toHaveBeenCalledWith(
        'tenant-1',
        'sup-1',
        ['ap-1'],
      );
      expect(created()).toMatchObject({
        status: 'MATCHED',
        total: 1_000_000,
        invoiceNumber: '001-001-0000123',
      });
      expect(invoices.linkPayables).toHaveBeenCalledWith(
        'tenant-1',
        'inv-1',
        ['ap-1'],
        tx,
      );
      // La deuda queda en firme y el plazo corre desde la factura.
      expect(invoices.updatePayable).toHaveBeenCalledWith(
        'tenant-1',
        'ap-1',
        {
          estimatedAmount: 1_000_000,
          amount: 1_000_000,
          paidAmount: 0,
          advanceApplied: 0,
          status: 'PENDING',
          dueDate: new Date('2026-11-06T00:00:00.000Z'),
        },
        tx,
      );
    });

    // Toda diferencia pide aprobación: la deuda no cambia hasta entonces.
    it.each([
      [
        'a different quantity',
        {
          lines: [
            { purchaseReceiptItemId: 'ri-1', quantity: 9, unitCost: 100_000 },
          ],
        },
      ],
      [
        'a different price',
        {
          lines: [
            { purchaseReceiptItemId: 'ri-1', quantity: 10, unitCost: 100_001 },
          ],
        },
      ],
      ['shipping', { shippingAmount: 50_000 }],
      ['a discount', { discountAmount: 50_000 }],
    ])('waits for approval when the invoice has %s', async (_, change) => {
      await service.create('tenant-1', dto(change), 'user-1');

      expect(created().status).toBe('PENDING_APPROVAL');
      expect(invoices.linkPayables).toHaveBeenCalled();
      expect(invoices.updatePayable).not.toHaveBeenCalled();
    });

    it('keeps what was received next to what was invoiced', async () => {
      await service.create(
        'tenant-1',
        dto({
          lines: [
            { purchaseReceiptItemId: 'ri-1', quantity: 9, unitCost: 95_000 },
          ],
        }),
        'user-1',
      );

      expect(created().items.create).toEqual([
        {
          purchaseReceiptItemId: 'ri-1',
          accountsPayableId: 'ap-1',
          quantity: 9,
          unitCost: 95_000,
          receivedQuantity: 10,
          receivedUnitCost: 100_000,
        },
      ]);
    });

    // De otro tenant, de otro proveedor o ya facturada: el repositorio no la
    // devuelve y la factura no se carga.
    it('refuses a receipt that is not available to this supplier and tenant', async () => {
      invoices.findInvoiceablePayables.mockResolvedValue([]);

      await expect(
        service.create('tenant-2', dto(), 'user-1'),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(invoices.create).not.toHaveBeenCalled();
    });

    it('refuses a line from a receipt that was not chosen', async () => {
      await expect(
        service.create(
          'tenant-1',
          dto({
            lines: [
              { purchaseReceiptItemId: 'ri-other', quantity: 1, unitCost: 1 },
            ],
          }),
          'user-1',
        ),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(invoices.create).not.toHaveBeenCalled();
    });

    it('refuses the same line twice', async () => {
      const line = {
        purchaseReceiptItemId: 'ri-1',
        quantity: 5,
        unitCost: 100_000,
      };

      await expect(
        service.create('tenant-1', dto({ lines: [line, line] }), 'user-1'),
      ).rejects.toThrow(/repite/);
    });

    it('refuses a discount larger than what was invoiced', async () => {
      await expect(
        service.create(
          'tenant-1',
          dto({ discountAmount: 1_000_001 }),
          'user-1',
        ),
      ).rejects.toThrow(/descuento/);
    });

    // El usuario lee el total del pie de la factura: si no sale de las
    // líneas, hay algo mal cargado y no se guarda.
    it('refuses a total that its lines, shipping and discount do not add up to', async () => {
      await expect(
        service.create('tenant-1', dto({ total: 2_000_000 }), 'user-1'),
      ).rejects.toThrow(/no coincide/);
      await expect(
        service.create(
          'tenant-1',
          dto({ shippingAmount: 50_000, total: 1_000_000 }),
          'user-1',
        ),
      ).rejects.toThrow(/no coincide/);
      expect(invoices.create).not.toHaveBeenCalled();
    });

    it('keeps the file of the invoice when one comes with it', async () => {
      await service.create('tenant-1', dto({ fileId: 'file-1' }), 'user-1');

      expect(files.getById).toHaveBeenCalledWith('tenant-1', 'file-1');
      expect(invoices.create.mock.calls[0][0]).toMatchObject({
        fileId: 'file-1',
      });
    });

    it('refuses a file that is neither a PDF nor a picture', async () => {
      files.getById.mockResolvedValue({ mimeType: 'application/zip' });

      await expect(
        service.create('tenant-1', dto({ fileId: 'file-1' }), 'user-1'),
      ).rejects.toThrow(/PDF/);
      expect(invoices.create).not.toHaveBeenCalled();
    });

    it('does not load the same invoice number twice for a supplier', async () => {
      invoices.findActiveByNumber.mockResolvedValue({ id: 'inv-0' });

      await expect(
        service.create('tenant-1', dto(), 'user-1'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(invoices.findActiveByNumber).toHaveBeenCalledWith(
        'tenant-1',
        'sup-1',
        '001-001-0000123',
      );
      expect(invoices.create).not.toHaveBeenCalled();
    });

    it('reports a conflict when someone else invoiced the receipt meanwhile', async () => {
      invoices.linkPayables.mockResolvedValue(0);

      await expect(
        service.create('tenant-1', dto(), 'user-1'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(invoices.updatePayable).not.toHaveBeenCalled();
    });
  });

  describe('approve', () => {
    it('turns the debt into what the invoice says', async () => {
      invoices.findById.mockResolvedValue(
        makeInvoice({
          shippingAmount: 50_000,
          items: [{ ...makeInvoice().items[0], quantity: 9 }],
        }),
      );

      await service.approve(
        'tenant-1',
        'inv-1',
        ' Faltó una unidad ',
        'user-9',
      );

      expect(invoices.transition).toHaveBeenCalledWith(
        'tenant-1',
        'inv-1',
        'PENDING_APPROVAL',
        expect.objectContaining({
          status: 'APPROVED',
          reviewNote: 'Faltó una unidad',
          reviewedById: 'user-9',
        }),
        tx,
      );
      // 9 × 100.000 + 50.000 de envío
      expect(invoices.updatePayable).toHaveBeenCalledWith(
        'tenant-1',
        'ap-1',
        expect.objectContaining({
          estimatedAmount: 1_000_000,
          amount: 950_000,
          status: 'PENDING',
        }),
        tx,
      );
    });

    // Se pagó todo por adelantado y la factura vino por menos.
    it('gives back to the order the advance the invoice did not use', async () => {
      invoices.findById.mockResolvedValue(
        makeInvoice({ items: [{ ...makeInvoice().items[0], quantity: 9 }] }),
      );
      invoices.lockPayables.mockResolvedValue([
        {
          id: 'ap-1',
          amount: 1_000_000,
          estimatedAmount: null,
          paidAmount: 1_000_000,
          advanceApplied: 1_000_000,
        },
      ]);

      await service.approve('tenant-1', 'inv-1', undefined, 'user-9');

      expect(invoices.updatePayable).toHaveBeenCalledWith(
        'tenant-1',
        'ap-1',
        expect.objectContaining({
          amount: 900_000,
          paidAmount: 900_000,
          advanceApplied: 900_000,
          status: 'PAID',
        }),
        tx,
      );
    });

    it('stops when ordinary payments already exceed the invoice', async () => {
      invoices.findById.mockResolvedValue(
        makeInvoice({ items: [{ ...makeInvoice().items[0], quantity: 9 }] }),
      );
      invoices.lockPayables.mockResolvedValue([
        {
          id: 'ap-1',
          amount: 1_000_000,
          estimatedAmount: null,
          paidAmount: 1_000_000,
          advanceApplied: 0,
        },
      ]);

      await expect(
        service.approve('tenant-1', 'inv-1', undefined, 'user-9'),
      ).rejects.toThrow(/más que lo que dice la factura/);
      expect(invoices.updatePayable).not.toHaveBeenCalled();
    });

    it('cannot approve what is no longer waiting for approval', async () => {
      invoices.transition.mockResolvedValue(0);

      await expect(
        service.approve('tenant-1', 'inv-1', undefined, 'user-9'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(invoices.updatePayable).not.toHaveBeenCalled();
    });

    it('does not reveal an invoice of another tenant', async () => {
      invoices.findById.mockResolvedValue(null);

      await expect(
        service.approve('tenant-2', 'inv-1', undefined, 'user-9'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(invoices.transition).not.toHaveBeenCalled();
    });
  });

  describe('attachFile', () => {
    it('attaches the file to an invoice already loaded', async () => {
      await service.attachFile('tenant-1', 'inv-1', 'file-1', 'user-1');

      expect(files.getById).toHaveBeenCalledWith('tenant-1', 'file-1');
      expect(invoices.setFile).toHaveBeenCalledWith(
        'tenant-1',
        'inv-1',
        'file-1',
      );
    });

    // FilesService no devuelve archivos de otro tenant: corta ahí.
    it('does not attach a file the tenant does not own', async () => {
      files.getById.mockRejectedValue(new NotFoundException());

      await expect(
        service.attachFile('tenant-1', 'inv-1', 'file-x', 'user-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(invoices.setFile).not.toHaveBeenCalled();
    });
  });

  describe('reject', () => {
    it('frees the receipts for the corrected invoice and leaves the debt estimated', async () => {
      await service.reject(
        'tenant-1',
        'inv-1',
        'Precio mal facturado',
        'user-9',
      );

      expect(invoices.transition).toHaveBeenCalledWith(
        'tenant-1',
        'inv-1',
        'PENDING_APPROVAL',
        expect.objectContaining({
          status: 'REJECTED',
          reviewNote: 'Precio mal facturado',
        }),
        tx,
      );
      expect(invoices.unlinkPayables).toHaveBeenCalledWith(
        'tenant-1',
        'inv-1',
        tx,
      );
      expect(invoices.updatePayable).not.toHaveBeenCalled();
    });
  });
});
