import { InterestInvoiceOnIssueListener } from './interest-invoice-on-issue.listener';
import { DocumentSourcesRepository } from '../repositories/document-sources.repository';

const TENANT = 'tenant-1';
const INVOICE_ID = 'invoice-1';

function makeInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: INVOICE_ID,
    invoiceNumber: '0000013',
    invoicePrefix: '001-002-',
    issuedAt: new Date('2026-08-26'),
    total: 350_000,
    tenant: {
      razonSocial: 'Mi Empresa SA',
      name: 'Mi Empresa',
      ruc: '80012345-6',
      address: 'Calle Falsa 123',
      city: 'Asunción',
      phone: '021-555555',
      timbradoNumero: '12345678',
      timbradoFecha: null,
      timbradoFechaFin: null,
      logoFileId: null,
    },
    items: [
      {
        description: 'Intereses moratorios correspondientes a la cuota N° 1',
        quantity: 1,
        unitPrice: 350_000,
        total: 350_000,
        ivaRate: 10,
        ivaAmount: 31_818,
      },
    ],
    paymentReceipt: {
      receiptNumber: '001-001-0000012',
      customer: {
        firstName: 'Cliente',
        secondFirstName: null,
        lastName: 'QA',
        secondLastName: null,
        documentType: 'CI',
        documentNumber: '1234567',
        customerCode: 'CLI-26-000001',
      },
    },
    ...overrides,
  };
}

describe('InterestInvoiceOnIssueListener', () => {
  let prisma: { invoice: { findFirst: jest.Mock; updateMany: jest.Mock } };
  let documentsRepository: { findTemplate: jest.Mock };
  let filesService: {
    getById: jest.Mock;
    getFileBuffer: jest.Mock;
    upload: jest.Mock;
  };
  let pdfService: { renderTemplate: jest.Mock; renderHtmlTemplate: jest.Mock };
  let docxTemplateService: { fillTemplate: jest.Mock; convertToPdf: jest.Mock };
  let listener: InterestInvoiceOnIssueListener;

  beforeEach(() => {
    prisma = {
      invoice: {
        findFirst: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    documentsRepository = { findTemplate: jest.fn().mockResolvedValue(null) };
    filesService = {
      getById: jest.fn(),
      getFileBuffer: jest.fn(),
      upload: jest.fn().mockResolvedValue({ id: 'file-1' }),
    };
    pdfService = {
      renderTemplate: jest.fn().mockResolvedValue(Buffer.from('pdf')),
      renderHtmlTemplate: jest.fn().mockResolvedValue(Buffer.from('pdf')),
    };
    docxTemplateService = {
      fillTemplate: jest.fn().mockReturnValue(Buffer.from('filled-docx')),
      convertToPdf: jest.fn().mockResolvedValue(Buffer.from('pdf-from-docx')),
    };

    listener = new InterestInvoiceOnIssueListener(
      new DocumentSourcesRepository(prisma as any),
      documentsRepository as any,
      filesService as any,
      pdfService as any,
      docxTemplateService as any,
    );
  });

  it('does nothing if the invoice is not found', async () => {
    prisma.invoice.findFirst.mockResolvedValue(null);

    await listener.handle({
      tenantId: TENANT,
      invoiceId: INVOICE_ID,
      paymentReceiptId: 'r-1',
      total: 350_000,
    });

    expect(filesService.upload).not.toHaveBeenCalled();
    expect(prisma.invoice.updateMany).not.toHaveBeenCalled();
  });

  it('does nothing if the invoice has no paymentReceipt (defensive)', async () => {
    prisma.invoice.findFirst.mockResolvedValue(
      makeInvoice({ paymentReceipt: null }),
    );

    await listener.handle({
      tenantId: TENANT,
      invoiceId: INVOICE_ID,
      paymentReceiptId: 'r-1',
      total: 350_000,
    });

    expect(filesService.upload).not.toHaveBeenCalled();
  });

  it('renders with the embedded HTML fallback when the tenant has no custom template', async () => {
    prisma.invoice.findFirst.mockResolvedValue(makeInvoice());

    await listener.handle({
      tenantId: TENANT,
      invoiceId: INVOICE_ID,
      paymentReceiptId: 'r-1',
      total: 350_000,
    });

    expect(documentsRepository.findTemplate).toHaveBeenCalledWith(
      TENANT,
      'INTEREST_INVOICE',
    );
    expect(pdfService.renderHtmlTemplate).toHaveBeenCalled();
    expect(pdfService.renderTemplate).not.toHaveBeenCalled();
  });

  it("uses the tenant's TIPTAP template when configured", async () => {
    documentsRepository.findTemplate.mockResolvedValue({
      content: '<tiptap-doc/>',
      contentFormat: 'TIPTAP',
    });
    prisma.invoice.findFirst.mockResolvedValue(makeInvoice());

    await listener.handle({
      tenantId: TENANT,
      invoiceId: INVOICE_ID,
      paymentReceiptId: 'r-1',
      total: 350_000,
    });

    expect(pdfService.renderTemplate).toHaveBeenCalled();
    expect(pdfService.renderHtmlTemplate).not.toHaveBeenCalled();
  });

  it('uploads the PDF and attaches pdfFileId to the invoice', async () => {
    prisma.invoice.findFirst.mockResolvedValue(makeInvoice());

    await listener.handle({
      tenantId: TENANT,
      invoiceId: INVOICE_ID,
      paymentReceiptId: 'r-1',
      total: 350_000,
    });

    expect(filesService.upload).toHaveBeenCalledWith(
      TENANT,
      undefined,
      expect.objectContaining({ mimetype: 'application/pdf' }),
      expect.objectContaining({
        module: 'billing',
        entityType: 'invoice',
        entityId: INVOICE_ID,
      }),
    );
    expect(prisma.invoice.updateMany).toHaveBeenCalledWith({
      where: {
        id: INVOICE_ID,
        tenantId: TENANT,
        status: 'PAID',
        pdfFileId: null,
        issuedAt: new Date('2026-08-26'),
      },
      data: { pdfFileId: 'file-1' },
    });
  });

  it('uses the DOCX template (fill + convert) instead of Puppeteer when configured', async () => {
    documentsRepository.findTemplate.mockResolvedValue({
      content: null,
      contentFormat: 'DOCX',
      fileRecord: { id: 'docx-file-1' },
    });
    filesService.getFileBuffer.mockResolvedValue(Buffer.from('template-bytes'));
    prisma.invoice.findFirst.mockResolvedValue(makeInvoice());

    await listener.handle({
      tenantId: TENANT,
      invoiceId: INVOICE_ID,
      paymentReceiptId: 'r-1',
      total: 350_000,
    });

    expect(filesService.getFileBuffer).toHaveBeenCalledWith({
      id: 'docx-file-1',
    });
    expect(docxTemplateService.fillTemplate).toHaveBeenCalledTimes(1);
    expect(docxTemplateService.convertToPdf).toHaveBeenCalledWith(
      Buffer.from('filled-docx'),
    );
    expect(pdfService.renderTemplate).not.toHaveBeenCalled();
    expect(pdfService.renderHtmlTemplate).not.toHaveBeenCalled();
    expect(filesService.upload).toHaveBeenCalledWith(
      TENANT,
      undefined,
      expect.objectContaining({ buffer: Buffer.from('pdf-from-docx') }),
      expect.objectContaining({
        module: 'billing',
        entityType: 'invoice',
        entityId: INVOICE_ID,
      }),
    );
  });

  it('is best-effort — does not throw if rendering fails', async () => {
    prisma.invoice.findFirst.mockResolvedValue(makeInvoice());
    pdfService.renderHtmlTemplate.mockRejectedValue(
      new Error('puppeteer boom'),
    );

    await expect(
      listener.handle({
        tenantId: TENANT,
        invoiceId: INVOICE_ID,
        paymentReceiptId: 'r-1',
        total: 350_000,
      }),
    ).resolves.toBeUndefined();
    expect(prisma.invoice.updateMany).not.toHaveBeenCalled();
  });
});
