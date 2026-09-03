import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TemplateKind } from '@prisma/client';
import { numberToWordsEs } from '../../../common/utils/number-to-words.util';
import { DocxTemplateService } from '../../../files/docx/docx-template.service';
import { unflattenVariables } from '../../../files/docx/docx-variables.util';
import { FilesService } from '../../../files/files.service';
import type { PdfTableVariable } from '../../../files/pdf/tiptap-to-html.converter';
import { PdfService } from '../../../files/pdf/pdf.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { DEFAULT_INTEREST_INVOICE_TEMPLATE } from '../constants/default-templates.constant';
import { DocumentsRepository } from '../repositories/documents.repository';

interface InterestInvoiceIssuedEvent {
  tenantId: string;
  invoiceId: string;
  paymentReceiptId: string;
  total: number;
}

function formatMoney(value: unknown): string {
  return Number(value).toLocaleString('es-PY', { maximumFractionDigits: 0 });
}

function formatDate(value: Date | null | undefined): string {
  if (!value) return '—';
  return value.toLocaleDateString('es-PY', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

// Para instantes reales (issuedAt = new Date() al emitir) — ver la misma
// distinción en invoice-on-issue.listener.ts.
function formatDateLocal(value: Date | null | undefined): string {
  if (!value) return '—';
  return value.toLocaleDateString('es-PY', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Asuncion',
  });
}

type IvaColumn = 'exenta' | '5' | '10';

function ivaColumn(ivaRate: unknown): IvaColumn {
  const rate = ivaRate == null ? null : Number(ivaRate);
  if (rate === 5) return '5';
  if (rate === 10) return '10';
  return 'exenta';
}

// Genera el PDF de la factura de intereses moratorios (mismo formato A4 que
// la factura de venta, ver invoice-on-issue.listener.ts) — best-effort:
// nunca debe bloquear el cobro de la cuota que la originó.
@Injectable()
export class InterestInvoiceOnIssueListener {
  private readonly logger = new Logger(InterestInvoiceOnIssueListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly documentsRepository: DocumentsRepository,
    private readonly filesService: FilesService,
    private readonly pdfService: PdfService,
    private readonly docxTemplateService: DocxTemplateService,
  ) {}

  @OnEvent('invoice.interest.issued')
  async handle(event: InterestInvoiceIssuedEvent) {
    try {
      await this.generate(event);
    } catch (error) {
      this.logger.error(
        `No se pudo generar el PDF de la factura de intereses ${event.invoiceId}: ${(error as Error).message}`,
      );
    }
  }

  private async generate(event: InterestInvoiceIssuedEvent) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: event.invoiceId, tenantId: event.tenantId },
      include: {
        tenant: true,
        items: true,
        paymentReceipt: { include: { customer: true } },
      },
    });
    if (!invoice || !invoice.paymentReceipt) return;

    const customer = invoice.paymentReceipt.customer;
    const customerName = [
      customer.firstName,
      customer.secondFirstName,
      customer.lastName,
      customer.secondLastName,
    ]
      .filter(Boolean)
      .join(' ');
    const customerDoc = customer.documentNumber
      ? `${customer.documentType ?? 'CI'}: ${customer.documentNumber}`
      : '—';

    const columnTotals: Record<IvaColumn, number> = {
      exenta: 0,
      '5': 0,
      '10': 0,
    };
    const ivaTotals: Record<'5' | '10', number> = { '5': 0, '10': 0 };
    const rows = invoice.items.map((item) => {
      const total = Number(item.total);
      const col = ivaColumn(item.ivaRate);
      columnTotals[col] += total;
      if (col === '5' || col === '10')
        ivaTotals[col] += Number(item.ivaAmount ?? 0);
      return [
        item.description,
        String(item.quantity),
        formatMoney(item.unitPrice),
        col === 'exenta' ? formatMoney(total) : '',
        col === '5' ? formatMoney(total) : '',
        col === '10' ? formatMoney(total) : '',
      ];
    });

    const invoiceTotal = Number(invoice.total);
    const variables: Record<string, string> = {
      'tenant.razonSocial': invoice.tenant.razonSocial ?? invoice.tenant.name,
      'tenant.ruc': invoice.tenant.ruc ?? '',
      'tenant.direccion': invoice.tenant.address ?? '',
      'tenant.ciudad': invoice.tenant.city ?? '',
      'tenant.telefono': invoice.tenant.phone ?? '',
      'timbrado.numero': invoice.tenant.timbradoNumero ?? '',
      'timbrado.inicioVigencia': formatDate(invoice.tenant.timbradoFecha),
      'timbrado.finVigencia': formatDate(invoice.tenant.timbradoFechaFin),
      'factura.numero': [invoice.invoicePrefix, invoice.invoiceNumber]
        .filter(Boolean)
        .join(''),
      'factura.fechaEmision': formatDateLocal(invoice.issuedAt),
      'cliente.nombre': customerName,
      'cliente.documento': customerDoc,
      'cliente.codigo': customer.customerCode ?? '—',
      'factura.reciboOrigen': invoice.paymentReceipt.receiptNumber,
      'factura.subtotalExentas': formatMoney(columnTotals.exenta),
      'factura.subtotal5': formatMoney(columnTotals['5']),
      'factura.subtotal10': formatMoney(columnTotals['10']),
      'factura.iva5': formatMoney(ivaTotals['5']),
      'factura.iva10': formatMoney(ivaTotals['10']),
      'factura.totalIva': formatMoney(ivaTotals['5'] + ivaTotals['10']),
      'factura.total': formatMoney(invoiceTotal),
      'factura.totalEnLetras': numberToWordsEs(invoiceTotal),
    };

    const tableVariables: Record<string, PdfTableVariable> = {
      'factura.items': {
        headers: [
          'Descripción',
          'Cant.',
          'P. Unit. IVA inc.',
          'Exentas',
          '5%',
          '10%',
        ],
        rows,
      },
    };

    let logoDataUri: string | undefined;
    if (invoice.tenant.logoFileId) {
      try {
        const logoRecord = await this.filesService.getById(
          event.tenantId,
          invoice.tenant.logoFileId,
        );
        const logoBuffer = await this.filesService.getFileBuffer(logoRecord);
        logoDataUri = `data:${logoRecord.mimeType};base64,${logoBuffer.toString('base64')}`;
      } catch (error) {
        this.logger.warn(
          `No se pudo cargar el logo del tenant ${event.tenantId} para la factura de intereses: ${(error as Error).message}`,
        );
      }
    }

    const template = await this.documentsRepository.findTemplate(
      event.tenantId,
      TemplateKind.INTEREST_INVOICE,
    );
    const content = template?.content ?? DEFAULT_INTEREST_INVOICE_TEMPLATE;

    const pdfBuffer =
      template?.contentFormat === 'DOCX'
        ? await this.docxTemplateService.convertToPdf(
            this.docxTemplateService.fillTemplate(
              await this.filesService.getFileBuffer(template.fileRecord!),
              unflattenVariables(variables, tableVariables),
            ),
          )
        : template?.contentFormat === 'TIPTAP'
          ? await this.pdfService.renderTemplate(
              content,
              variables,
              tableVariables,
              {
                logoDataUri,
                companyName: invoice.tenant.razonSocial ?? invoice.tenant.name,
              },
              'A4',
            )
          : await this.pdfService.renderHtmlTemplate(
              content,
              variables,
              tableVariables,
              {
                'tenant.logo': logoDataUri
                  ? `<img class="company-logo" src="${logoDataUri}" />`
                  : '',
              },
              'A4',
            );

    const fileRecord = await this.filesService.upload(
      event.tenantId,
      undefined,
      {
        buffer: pdfBuffer,
        originalname: `factura-intereses-${variables['factura.numero'] || invoice.id}.pdf`,
        mimetype: 'application/pdf',
        size: pdfBuffer.length,
      },
      { module: 'billing', entityType: 'invoice', entityId: invoice.id },
    );

    await this.prisma.invoice.updateMany({
      where: { id: invoice.id, tenantId: event.tenantId },
      data: { pdfFileId: fileRecord.id },
    });
  }
}
