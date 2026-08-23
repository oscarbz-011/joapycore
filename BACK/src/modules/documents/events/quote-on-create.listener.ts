import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TemplateKind } from '@prisma/client';
import { numberToWordsEs } from '../../../common/utils/number-to-words.util';
import { FilesService } from '../../../files/files.service';
import type { PdfTableVariable } from '../../../files/pdf/tiptap-to-html.converter';
import { PdfService } from '../../../files/pdf/pdf.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { DEFAULT_QUOTE_TEMPLATE } from '../constants/default-templates.constant';
import { DocumentsRepository } from '../repositories/documents.repository';

interface SaleOrderQuotedEvent {
  tenantId: string;
  saleOrderId: string;
  issuedById?: string;
}

function formatMoney(value: unknown): string {
  return Number(value).toLocaleString('es-PY', { maximumFractionDigits: 0 });
}

function formatDate(value: Date | null | undefined): string {
  if (!value) return '—';
  return value.toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Genera el PDF del presupuesto al crearlo — nunca debe bloquear la creación
// en sí: si Puppeteer o la plantilla fallan, se registra el error y el
// presupuesto queda creado igual, solo sin quotePdfFileId (reintentable
// creando uno nuevo).
@Injectable()
export class QuoteOnCreateListener {
  private readonly logger = new Logger(QuoteOnCreateListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly documentsRepository: DocumentsRepository,
    private readonly filesService: FilesService,
    private readonly pdfService: PdfService,
  ) {}

  @OnEvent('sale.order.quoted')
  async handle(event: SaleOrderQuotedEvent) {
    try {
      await this.generate(event);
    } catch (error) {
      this.logger.error(
        `No se pudo generar el PDF del presupuesto ${event.saleOrderId}: ${(error as Error).message}`,
      );
    }
  }

  private async generate(event: SaleOrderQuotedEvent) {
    const order = await this.prisma.saleOrder.findFirst({
      where: { id: event.saleOrderId, tenantId: event.tenantId },
      include: {
        tenant: true,
        customer: true,
        items: { include: { product: true } },
      },
    });
    if (!order) return;

    const customerName = [
      order.customer.firstName,
      order.customer.secondFirstName,
      order.customer.lastName,
      order.customer.secondLastName,
    ]
      .filter(Boolean)
      .join(' ');
    const customerDoc = order.customer.documentNumber
      ? `${order.customer.documentType ?? 'CI'}: ${order.customer.documentNumber}`
      : '—';

    const total = Number(order.total ?? 0);
    const rows = order.items.map((item) => {
      const lineTotal = Number(item.unitPrice) * item.quantity;
      const description = item.product?.name ?? item.description ?? 'Ítem';
      const descriptionWithSpecs = item.specNotes
        ? `${description}\n${item.specNotes}`
        : description;
      return [
        descriptionWithSpecs,
        String(item.quantity),
        `Gs. ${formatMoney(item.unitPrice)}`,
        `Gs. ${formatMoney(lineTotal)}`,
      ];
    });

    const variables: Record<string, string> = {
      'tenant.razonSocial': order.tenant.razonSocial ?? order.tenant.name,
      'tenant.direccion': order.tenant.address ?? '',
      'tenant.ciudad': order.tenant.city ?? '',
      'tenant.telefono': order.tenant.phone ?? '',
      'presupuesto.numero': order.quoteNumber ?? '—',
      'presupuesto.fecha': formatDate(order.orderDate),
      'cliente.nombre': customerName,
      'cliente.documento': customerDoc,
      'cliente.direccion': order.customer.address ?? '',
      'presupuesto.total': formatMoney(total),
      'presupuesto.totalEnLetras': numberToWordsEs(total),
    };

    const tableVariables: Record<string, PdfTableVariable> = {
      'presupuesto.items': {
        headers: ['Descripción', 'Cant.', 'P. Unitario', 'Subtotal'],
        rows,
      },
    };

    let logoDataUri: string | undefined;
    if (order.tenant.logoFileId) {
      try {
        const logoRecord = await this.filesService.getById(event.tenantId, order.tenant.logoFileId);
        const logoBuffer = await this.filesService.getFileBuffer(logoRecord);
        logoDataUri = `data:${logoRecord.mimeType};base64,${logoBuffer.toString('base64')}`;
      } catch (error) {
        this.logger.warn(
          `No se pudo cargar el logo del tenant ${event.tenantId} para el presupuesto: ${(error as Error).message}`,
        );
      }
    }

    const template = await this.documentsRepository.findTemplate(event.tenantId, TemplateKind.QUOTE);
    const content = template?.content ?? DEFAULT_QUOTE_TEMPLATE;

    const pdfBuffer = template?.contentFormat === 'TIPTAP'
      ? await this.pdfService.renderTemplate(
          content,
          variables,
          tableVariables,
          { logoDataUri, companyName: order.tenant.razonSocial ?? order.tenant.name },
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
        originalname: `presupuesto-${order.quoteNumber ?? order.id}.pdf`,
        mimetype: 'application/pdf',
        size: pdfBuffer.length,
      },
      { module: 'documents', entityType: 'sale_order', entityId: order.id },
    );

    await this.prisma.saleOrder.updateMany({
      where: { id: order.id, tenantId: event.tenantId },
      data: { quotePdfFileId: fileRecord.id },
    });
  }
}
