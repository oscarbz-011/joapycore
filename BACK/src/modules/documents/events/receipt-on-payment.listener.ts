import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TemplateKind } from '@prisma/client';
import { numberToWordsEs } from '../../../common/utils/number-to-words.util';
import { DocxTemplateService } from '../../../files/docx/docx-template.service';
import { unflattenVariables } from '../../../files/docx/docx-variables.util';
import { FilesService } from '../../../files/files.service';
import type { PdfTableVariable } from '../../../files/pdf/tiptap-to-html.converter';
import { PdfService } from '../../../files/pdf/pdf.service';
import { DocumentSourcesRepository } from '../repositories/document-sources.repository';
import { DEFAULT_PAYMENT_RECEIPT_TEMPLATE } from '../constants/default-templates.constant';
import { DocumentsRepository } from '../repositories/documents.repository';

interface PaymentReceiptCreatedEvent {
  tenantId: string;
  receiptId: string;
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  CHECK: 'Cheque',
  BANK_TRANSFER: 'Transferencia',
  PAGO_EXPRESS: 'PagoExpress',
  AQUI_PAGO: 'AquíPago',
};

function formatMoney(value: unknown): string {
  return Number(value).toLocaleString('es-PY', { maximumFractionDigits: 0 });
}

// issuedAt es un instante real (new Date() al cobrar) — hora de Paraguay,
// no UTC (ver la misma distinción en invoice-on-issue.listener.ts).
function formatDateLocal(value: Date): string {
  return value.toLocaleDateString('es-PY', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Asuncion',
  });
}

// Genera el PDF del recibo (14x21,5cm, formato DNIT) al cobrar una cuota —
// igual que la factura, best-effort: nunca debe bloquear el registro del
// pago si Puppeteer o la plantilla fallan.
@Injectable()
export class ReceiptOnPaymentListener {
  private readonly logger = new Logger(ReceiptOnPaymentListener.name);

  constructor(
    private readonly sources: DocumentSourcesRepository,
    private readonly documentsRepository: DocumentsRepository,
    private readonly filesService: FilesService,
    private readonly pdfService: PdfService,
    private readonly docxTemplateService: DocxTemplateService,
  ) {}

  @OnEvent('payment.receipt.created')
  async handle(event: PaymentReceiptCreatedEvent) {
    try {
      await this.generate(event);
    } catch (error) {
      this.logger.error(
        `No se pudo generar el PDF del recibo ${event.receiptId}: ${(error as Error).message}`,
      );
    }
  }

  private async generate(event: PaymentReceiptCreatedEvent) {
    const receipt = await this.sources.findReceiptForPdf(
      event.tenantId,
      event.receiptId,
    );
    if (!receipt) return;

    const customerName = `${receipt.customer.firstName} ${receipt.customer.lastName}`;
    const customerDoc = receipt.customer.documentNumber
      ? `${receipt.customer.documentType ?? 'CI'}: ${receipt.customer.documentNumber}`
      : '—';
    const city = receipt.branch?.city ?? receipt.tenant.city ?? '';

    const variables: Record<string, string> = {
      'tenant.razonSocial': receipt.tenant.razonSocial ?? receipt.tenant.name,
      'tenant.ruc': receipt.tenant.ruc ?? '',
      'tenant.direccion': receipt.tenant.address ?? '',
      'tenant.telefono': receipt.tenant.phone ?? '',
      'recibo.numero': receipt.receiptNumber,
      'recibo.ciudad': city,
      'recibo.fecha': formatDateLocal(receipt.issuedAt),
      'cliente.nombre': customerName,
      'cliente.documento': customerDoc,
      'cliente.codigo': receipt.customer.customerCode ?? '—',
      'recibo.montoEnLetras': numberToWordsEs(Number(receipt.totalAmount)),
      'recibo.total': formatMoney(receipt.totalAmount),
      'recibo.formaDePago':
        PAYMENT_METHOD_LABELS[receipt.paymentMethod] ?? receipt.paymentMethod,
      'recibo.cobrador': receipt.collectedBy
        ? `${receipt.collectedBy.firstName} ${receipt.collectedBy.lastName}`
        : '—',
    };

    const tableVariables: Record<string, PdfTableVariable> = {
      'recibo.items': {
        headers: ['Item', 'Concepto', 'Guaraníes'],
        rows: receipt.items.map((item) => [
          String(item.installmentNumber),
          `Cuota N° ${item.installmentNumber}`,
          formatMoney(item.amountApplied),
        ]),
      },
    };

    let logoDataUri: string | undefined;
    if (receipt.tenant.logoFileId) {
      try {
        const logoRecord = await this.filesService.getById(
          event.tenantId,
          receipt.tenant.logoFileId,
        );
        const logoBuffer = await this.filesService.getFileBuffer(logoRecord);
        logoDataUri = `data:${logoRecord.mimeType};base64,${logoBuffer.toString('base64')}`;
      } catch (error) {
        this.logger.warn(
          `No se pudo cargar el logo del tenant ${event.tenantId} para el recibo: ${(error as Error).message}`,
        );
      }
    }

    const template = await this.documentsRepository.findTemplate(
      event.tenantId,
      TemplateKind.PAYMENT_RECEIPT,
    );
    const content = template?.content ?? DEFAULT_PAYMENT_RECEIPT_TEMPLATE;
    const pageSize = { width: '21.5cm', height: '14cm' };

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
                companyName: receipt.tenant.razonSocial ?? receipt.tenant.name,
              },
              pageSize,
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
              pageSize,
            );

    const fileRecord = await this.filesService.upload(
      event.tenantId,
      receipt.collectedById ?? undefined,
      {
        buffer: pdfBuffer,
        originalname: `recibo-${receipt.receiptNumber}.pdf`,
        mimetype: 'application/pdf',
        size: pdfBuffer.length,
      },
      {
        module: 'finance',
        entityType: 'payment_receipt',
        entityId: receipt.id,
      },
    );

    await this.sources.setReceiptPdf(event.tenantId, receipt.id, fileRecord.id);
  }
}
