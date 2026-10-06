import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TemplateKind } from '@prisma/client';
import { DocxTemplateService } from '../../../files/docx/docx-template.service';
import { unflattenVariables } from '../../../files/docx/docx-variables.util';
import { FilesService } from '../../../files/files.service';
import { PdfService } from '../../../files/pdf/pdf.service';
import { buildPurchaseOrderVariables } from '../builders/purchase-order-variables';
import { DEFAULT_PURCHASE_ORDER_TEMPLATE } from '../constants/default-templates.constant';
import { DocumentSourcesRepository } from '../repositories/document-sources.repository';
import { DocumentsRepository } from '../repositories/documents.repository';

interface PurchaseOrderPdfRequestedEvent {
  tenantId: string;
  purchaseOrderId: string;
  requestedById?: string;
}

// Genera el PDF de la orden de compra, el documento que se le manda al
// proveedor. Nunca bloquea a quien lo pide: si Puppeteer o la plantilla
// fallan queda el log, la orden sigue sin pdfFileId y se puede pedir de nuevo.
@Injectable()
export class PurchaseOrderPdfListener {
  private readonly logger = new Logger(PurchaseOrderPdfListener.name);

  constructor(
    private readonly sources: DocumentSourcesRepository,
    private readonly documentsRepository: DocumentsRepository,
    private readonly filesService: FilesService,
    private readonly pdfService: PdfService,
    private readonly docxTemplateService: DocxTemplateService,
  ) {}

  @OnEvent('purchase.order.pdf.requested')
  async handle(event: PurchaseOrderPdfRequestedEvent) {
    try {
      await this.generate(event);
    } catch (error) {
      this.logger.error(
        `No se pudo generar el PDF de la orden de compra ${event.purchaseOrderId}: ${(error as Error).message}`,
      );
    }
  }

  private async generate(event: PurchaseOrderPdfRequestedEvent) {
    const order = await this.sources.findPurchaseOrderForPdf(
      event.tenantId,
      event.purchaseOrderId,
    );
    // La orden no se edita después de creada: un PDF ya generado sigue valiendo.
    if (!order || order.pdfFileId) return;

    const { variables, tableVariables } = buildPurchaseOrderVariables(order);

    let logoDataUri: string | undefined;
    if (order.tenant.logoFileId) {
      try {
        const logoRecord = await this.filesService.getById(
          event.tenantId,
          order.tenant.logoFileId,
        );
        const logoBuffer = await this.filesService.getFileBuffer(logoRecord);
        logoDataUri = `data:${logoRecord.mimeType};base64,${logoBuffer.toString('base64')}`;
      } catch (error) {
        this.logger.warn(
          `No se pudo cargar el logo del tenant ${event.tenantId} para la orden de compra: ${(error as Error).message}`,
        );
      }
    }

    const template = await this.documentsRepository.findTemplate(
      event.tenantId,
      TemplateKind.PURCHASE_ORDER,
    );
    const content = template?.content ?? DEFAULT_PURCHASE_ORDER_TEMPLATE;
    const companyName = variables['tenant.razonSocial'];

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
              { logoDataUri, companyName },
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
      event.requestedById,
      {
        buffer: pdfBuffer,
        originalname: `orden-de-compra-${order.orderNumber ?? order.id}.pdf`,
        mimetype: 'application/pdf',
        size: pdfBuffer.length,
      },
      {
        module: 'procurement',
        entityType: 'purchase_order',
        entityId: order.id,
      },
    );

    await this.sources.setPurchaseOrderPdf(
      event.tenantId,
      order.id,
      fileRecord.id,
    );
  }
}
