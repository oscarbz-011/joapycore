import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TemplateKind } from '@prisma/client';
import { numberToWordsEs } from '../../../common/utils/number-to-words.util';
import { FilesService } from '../../../files/files.service';
import type { PdfTableVariable } from '../../../files/pdf/tiptap-to-html.converter';
import { PdfService } from '../../../files/pdf/pdf.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { DEFAULT_INVOICE_TEMPLATE } from '../constants/default-templates.constant';
import { DocumentsRepository } from '../repositories/documents.repository';

interface InvoiceIssuedEvent {
  tenantId: string;
  invoiceId: string;
  saleOrderId: string;
  paymentCondition?: string;
  total: number;
  dueDate: string | null;
  issuedById?: string;
}

function formatMoney(value: unknown): string {
  return Number(value).toLocaleString('es-PY', { maximumFractionDigits: 0 });
}

function formatDate(value: Date | null | undefined): string {
  if (!value) return '—';
  return value.toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

type IvaColumn = 'exenta' | '5' | '10';

function ivaColumn(ivaRate: unknown): IvaColumn {
  const rate = ivaRate == null ? null : Number(ivaRate);
  if (rate === 5) return '5';
  if (rate === 10) return '10';
  return 'exenta';
}

// Genera el PDF de la factura (A4, formato DNIT) al emitirla — nunca debe
// bloquear la emisión en sí: si Puppeteer o la plantilla fallan, se registra
// el error y la factura queda emitida igual, solo sin pdfFileId (el frontend
// lo trata como "PDF no disponible", reintentable reimprimiendo más tarde).
@Injectable()
export class InvoiceOnIssueListener {
  private readonly logger = new Logger(InvoiceOnIssueListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly documentsRepository: DocumentsRepository,
    private readonly filesService: FilesService,
    private readonly pdfService: PdfService,
  ) {}

  @OnEvent('invoice.issued')
  async handle(event: InvoiceIssuedEvent) {
    try {
      await this.generate(event);
    } catch (error) {
      this.logger.error(
        `No se pudo generar el PDF de la factura ${event.invoiceId}: ${(error as Error).message}`,
      );
    }
  }

  private async generate(event: InvoiceIssuedEvent) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: event.invoiceId, tenantId: event.tenantId },
      include: {
        tenant: true,
        items: true,
        saleOrder: {
          include: {
            customer: true,
            branch: true,
            downPayment: true,
            loan: { include: { installments: { orderBy: { number: 'asc' }, take: 1 } } },
          },
        },
      },
    });
    if (!invoice) return;

    const customerName = [
      invoice.saleOrder.customer.firstName,
      invoice.saleOrder.customer.secondFirstName,
      invoice.saleOrder.customer.lastName,
      invoice.saleOrder.customer.secondLastName,
    ]
      .filter(Boolean)
      .join(' ');
    const customerDoc = invoice.saleOrder.customer.documentNumber
      ? `${invoice.saleOrder.customer.documentType ?? 'CI'}: ${invoice.saleOrder.customer.documentNumber}`
      : '—';

    const isCredit = invoice.saleOrder.saleType === 'CREDIT';
    let condicionVenta = 'CONTADO';
    if (isCredit) {
      const downPayment = invoice.saleOrder.downPayment?.amount ?? 0;
      const firstDue = invoice.saleOrder.loan?.installments[0]?.dueDate;
      condicionVenta = `CRÉDITO — Entrega Inicial Gs ${formatMoney(downPayment)} Más ${invoice.saleOrder.installments ?? 0} Cuotas${firstDue ? `, la 1era. Vence el ${formatDate(firstDue)}` : ''}`;
    }

    // Para crédito, cada ítem se prorratea sobre el total financiado (incluye
    // interés) en vez de su total contado — mismo criterio que ya usaba la
    // pantalla de impresión anterior a esta plantilla.
    const itemsSubtotal = invoice.items.reduce((s, it) => s + Number(it.total), 0);
    const invoiceTotal = Number(invoice.total);
    const displayTotal = (total: number) =>
      isCredit && itemsSubtotal > 0 ? invoiceTotal * (total / itemsSubtotal) : total;

    const columnTotals: Record<IvaColumn, number> = { exenta: 0, '5': 0, '10': 0 };
    const ivaTotals: Record<'5' | '10', number> = { '5': 0, '10': 0 };
    const rows = invoice.items.map((item) => {
      const total = displayTotal(Number(item.total));
      const col = ivaColumn(item.ivaRate);
      columnTotals[col] += total;
      if (col === '5' || col === '10') {
        const ivaShare = isCredit && itemsSubtotal > 0
          ? Number(item.ivaAmount ?? 0) * (invoiceTotal / itemsSubtotal)
          : Number(item.ivaAmount ?? 0);
        ivaTotals[col] += ivaShare;
      }
      return [
        item.description,
        String(item.quantity),
        formatMoney(item.unitPrice),
        col === 'exenta' ? formatMoney(total) : '',
        col === '5' ? formatMoney(total) : '',
        col === '10' ? formatMoney(total) : '',
      ];
    });

    const variables: Record<string, string> = {
      'tenant.razonSocial': invoice.tenant.razonSocial ?? invoice.tenant.name,
      'tenant.ruc': invoice.tenant.ruc ?? '',
      'tenant.direccion': invoice.tenant.address ?? '',
      'tenant.ciudad': invoice.tenant.city ?? '',
      'tenant.telefono': invoice.tenant.phone ?? '',
      'timbrado.numero': invoice.tenant.timbradoNumero ?? '',
      'timbrado.inicioVigencia': formatDate(invoice.tenant.timbradoFecha),
      'timbrado.finVigencia': formatDate(invoice.tenant.timbradoFechaFin),
      'factura.numero': [invoice.invoicePrefix, invoice.invoiceNumber].filter(Boolean).join(''),
      'factura.fechaEmision': formatDate(invoice.issuedAt),
      'cliente.nombre': customerName,
      'cliente.documento': customerDoc,
      'cliente.direccion': invoice.saleOrder.customer.address ?? '',
      'cliente.codigo': invoice.saleOrder.customer.customerCode ?? '—',
      'factura.condicionVenta': condicionVenta,
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
        headers: ['Descripción', 'Cant.', 'P. Unit. IVA inc.', 'Exentas', '5%', '10%'],
        rows,
      },
    };

    let logoDataUri: string | undefined;
    if (invoice.tenant.logoFileId) {
      try {
        const logoRecord = await this.filesService.getById(event.tenantId, invoice.tenant.logoFileId);
        const logoBuffer = await this.filesService.getFileBuffer(logoRecord);
        logoDataUri = `data:${logoRecord.mimeType};base64,${logoBuffer.toString('base64')}`;
      } catch (error) {
        this.logger.warn(
          `No se pudo cargar el logo del tenant ${event.tenantId} para la factura: ${(error as Error).message}`,
        );
      }
    }

    const template = await this.documentsRepository.findTemplate(event.tenantId, TemplateKind.INVOICE);
    const content = template?.content ?? DEFAULT_INVOICE_TEMPLATE;

    // El fallback embebido es HTML crudo; una plantilla del tenant puede ser
    // HTML o TipTap (contentFormat), cada una con su propio pipeline de PdfService.
    const pdfBuffer = template?.contentFormat === 'TIPTAP'
      ? await this.pdfService.renderTemplate(
          content,
          variables,
          tableVariables,
          { logoDataUri, companyName: invoice.tenant.razonSocial ?? invoice.tenant.name },
          'A4',
        )
      : await this.pdfService.renderHtmlTemplate(
          content,
          variables,
          tableVariables,
          { 'tenant.logo': logoDataUri ? `<img class="company-logo" src="${logoDataUri}" />` : '' },
          'A4',
        );

    const fileRecord = await this.filesService.upload(
      event.tenantId,
      event.issuedById,
      {
        buffer: pdfBuffer,
        originalname: `factura-${variables['factura.numero'] || invoice.id}.pdf`,
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
