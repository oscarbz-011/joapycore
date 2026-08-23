import { DocType, DocVisibility, TemplateKind } from '@prisma/client';
import { SaleContractOnInvoiceListener } from './sale-contract-on-invoice.listener';

const TENANT = 'tenant-1';
const SALE_ORDER_ID = 'order-1';

function makeSaleOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: SALE_ORDER_ID,
    tenantId: TENANT,
    saleType: 'CREDIT',
    orderDate: new Date('2026-08-01'),
    total: 5000000,
    tenant: { name: 'Tenant SA', razonSocial: 'Tenant SA', ruc: '80012345-6', address: 'Av. Test 123' },
    customer: {
      firstName: 'Juan',
      secondFirstName: null,
      lastName: 'Pérez',
      secondLastName: null,
      documentNumber: '1234567',
      email: 'juan@example.com',
      phone: '0981000000',
      address: 'Calle Falsa 123',
    },
    items: [
      { quantity: 1, unitPrice: 5000000, description: null, product: { name: 'Heladera' } },
    ],
    loan: {
      principal: 4000000,
      interestRate: 15,
      totalInstallments: 12,
      totalAmount: 4600000,
      installments: [{ amount: 383333 }],
    },
    downPayment: { amount: 1000000 },
    invoice: { invoicePrefix: '001-001', invoiceNumber: '0000123', issuedAt: new Date('2026-08-15') },
    branch: { city: 'Asunción' },
    ...overrides,
  };
}

function makeTemplate(overrides: Record<string, unknown> = {}) {
  return {
    id: 'template-1',
    tenantId: TENANT,
    isTemplate: true,
    templateKind: TemplateKind.SALE_CONTRACT,
    content: JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cliente: {{cliente.nombre}}' }] }],
    }),
    categoryId: null,
    visibility: DocVisibility.PRIVATE,
    allowedRoles: [] as string[],
    ...overrides,
  };
}

describe('SaleContractOnInvoiceListener', () => {
  let prisma: { saleOrder: { findFirst: jest.Mock } };
  let documentsRepository: { findAll: jest.Mock; findTemplate: jest.Mock; create: jest.Mock };
  let filesService: { upload: jest.Mock; getById: jest.Mock; getFileBuffer: jest.Mock };
  let pdfService: { renderTemplate: jest.Mock };
  let listener: SaleContractOnInvoiceListener;

  const baseEvent = {
    tenantId: TENANT,
    invoiceId: 'invoice-1',
    saleOrderId: SALE_ORDER_ID,
    paymentCondition: 'CREDIT',
    total: 5000000,
    dueDate: null,
    issuedById: 'user-1',
  };

  beforeEach(() => {
    prisma = { saleOrder: { findFirst: jest.fn().mockResolvedValue(makeSaleOrder()) } };
    documentsRepository = {
      findAll: jest.fn().mockResolvedValue([]),
      findTemplate: jest.fn().mockResolvedValue(makeTemplate()),
      create: jest.fn().mockResolvedValue({ id: 'doc-1' }),
    };
    filesService = {
      upload: jest.fn().mockResolvedValue({ id: 'file-1' }),
      getById: jest.fn().mockResolvedValue({ id: 'logo-1', mimeType: 'image/png' }),
      getFileBuffer: jest.fn().mockResolvedValue(Buffer.from('fake-logo-bytes')),
    };
    pdfService = { renderTemplate: jest.fn().mockResolvedValue(Buffer.from('%PDF-fake')) };

    listener = new SaleContractOnInvoiceListener(
      prisma as any,
      documentsRepository as any,
      filesService as any,
      pdfService as any,
    );
  });

  it('generates a contract for a credit sale with an active template', async () => {
    await listener.handle(baseEvent);

    expect(pdfService.renderTemplate).toHaveBeenCalledTimes(1);
    expect(filesService.upload).toHaveBeenCalledWith(
      TENANT,
      'user-1',
      expect.objectContaining({ mimetype: 'application/pdf' }),
      { module: 'documents', entityType: 'sale_order', entityId: SALE_ORDER_ID },
    );
    expect(documentsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT,
        type: DocType.CONTRACT,
        entityType: 'sale_order',
        entityId: SALE_ORDER_ID,
        fileRecordId: 'file-1',
      }),
    );
  });

  it('resolves the interpolated customer name into the variables snapshot', async () => {
    await listener.handle(baseEvent);

    const call = documentsRepository.create.mock.calls[0][0];
    expect(call.variables['cliente.nombre']).toBe('Juan Pérez');
    expect(call.variables['factura.numero']).toBe('001-001-0000123');
  });

  it('uses financedUnitPrice (not the cash unitPrice) in the venta.items table when present', async () => {
    prisma.saleOrder.findFirst.mockResolvedValue(
      makeSaleOrder({
        items: [
          { quantity: 1, unitPrice: 5000000, financedUnitPrice: 5750000, description: null, product: { name: 'Heladera' } },
        ],
      }),
    );

    await listener.handle(baseEvent);

    const [, , tableVariables] = pdfService.renderTemplate.mock.calls[0];
    expect(tableVariables['venta.items'].rows).toEqual([
      ['Heladera', '1', '5.750.000', '5.750.000'],
    ]);
  });

  it('falls back to the cash unitPrice in venta.items when financedUnitPrice is not set', async () => {
    await listener.handle(baseEvent);

    const [, , tableVariables] = pdfService.renderTemplate.mock.calls[0];
    expect(tableVariables['venta.items'].rows).toEqual([
      ['Heladera', '1', '5.000.000', '5.000.000'],
    ]);
  });

  it("resolves the branch's city into the sucursal.ciudad variable", async () => {
    await listener.handle(baseEvent);

    const call = documentsRepository.create.mock.calls[0][0];
    expect(call.variables['sucursal.ciudad']).toBe('Asunción');
  });

  it('resolves sucursal.ciudad to an empty string when the sale has no branch', async () => {
    prisma.saleOrder.findFirst.mockResolvedValue(makeSaleOrder({ branch: null }));

    await listener.handle(baseEvent);

    const call = documentsRepository.create.mock.calls[0][0];
    expect(call.variables['sucursal.ciudad']).toBe('');
  });

  it('resolves the tenant logo to a data URI and passes it to the PDF renderer', async () => {
    prisma.saleOrder.findFirst.mockResolvedValue(
      makeSaleOrder({ tenant: { name: 'Tenant SA', razonSocial: 'Tenant SA', logoFileId: 'logo-1' } }),
    );

    await listener.handle(baseEvent);

    expect(filesService.getById).toHaveBeenCalledWith(TENANT, 'logo-1');
    expect(pdfService.renderTemplate).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.any(Object),
      expect.objectContaining({
        logoDataUri: `data:image/png;base64,${Buffer.from('fake-logo-bytes').toString('base64')}`,
        companyName: 'Tenant SA',
      }),
    );
  });

  it('generates the contract without a logo when the tenant has none configured', async () => {
    await listener.handle(baseEvent);

    expect(filesService.getById).not.toHaveBeenCalled();
    expect(pdfService.renderTemplate).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.any(Object),
      expect.objectContaining({ logoDataUri: undefined }),
    );
  });

  it('generates the contract without a logo (best-effort) when resolving the logo file fails', async () => {
    prisma.saleOrder.findFirst.mockResolvedValue(
      makeSaleOrder({ tenant: { name: 'Tenant SA', razonSocial: 'Tenant SA', logoFileId: 'logo-1' } }),
    );
    filesService.getById.mockRejectedValue(new Error('archivo no encontrado'));

    await listener.handle(baseEvent);

    expect(pdfService.renderTemplate).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.any(Object),
      expect.objectContaining({ logoDataUri: undefined }),
    );
    expect(documentsRepository.create).toHaveBeenCalled();
  });

  it('does nothing for a cash sale', async () => {
    prisma.saleOrder.findFirst.mockResolvedValue(makeSaleOrder({ saleType: 'CASH' }));

    await listener.handle(baseEvent);

    expect(pdfService.renderTemplate).not.toHaveBeenCalled();
    expect(documentsRepository.create).not.toHaveBeenCalled();
  });

  it('does nothing when no template is configured for the tenant', async () => {
    documentsRepository.findTemplate.mockResolvedValue(null);

    await listener.handle(baseEvent);

    expect(pdfService.renderTemplate).not.toHaveBeenCalled();
    expect(documentsRepository.create).not.toHaveBeenCalled();
  });

  it('is idempotent — does not regenerate when a contract already exists', async () => {
    documentsRepository.findAll.mockResolvedValue([{ id: 'existing-contract' }]);

    await listener.handle(baseEvent);

    expect(pdfService.renderTemplate).not.toHaveBeenCalled();
    expect(documentsRepository.create).not.toHaveBeenCalled();
  });

  it('is best-effort — swallows errors instead of throwing', async () => {
    pdfService.renderTemplate.mockRejectedValue(new Error('boom'));

    await expect(listener.handle(baseEvent)).resolves.toBeUndefined();
  });

  it('does nothing when the sale order cannot be found', async () => {
    prisma.saleOrder.findFirst.mockResolvedValue(null);

    await listener.handle(baseEvent);

    expect(pdfService.renderTemplate).not.toHaveBeenCalled();
  });
});
