import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TemplateKind } from '@prisma/client';
import {
  DEFAULT_INVOICE_TEMPLATE,
  DEFAULT_PAYMENT_RECEIPT_TEMPLATE,
} from '../constants/default-templates.constant';
import { DocumentsRepository } from '../repositories/documents.repository';

interface TenantRegisteredEvent {
  tenantId: string;
  industry?: string;
}

// Siembra las plantillas de factura y recibo de dinero como documentos
// reales y editables desde el módulo Documentos — así el tenant puede
// revisarlas/personalizarlas antes de emitir su primera factura, en vez de
// depender silenciosamente del fallback embebido en código. No depende de
// que el módulo "documents" esté activo: facturación no es opcional.
@Injectable()
export class SeedBillingTemplatesOnTenantRegisteredListener {
  private readonly logger = new Logger(SeedBillingTemplatesOnTenantRegisteredListener.name);

  constructor(private readonly documentsRepository: DocumentsRepository) {}

  @OnEvent('tenant.registered')
  async handle(event: TenantRegisteredEvent) {
    try {
      await this.documentsRepository.create({
        tenantId: event.tenantId,
        type: 'BILLING',
        title: 'Factura (plantilla)',
        description: 'Plantilla usada para generar el PDF al emitir una factura.',
        visibility: 'PUBLIC',
        isTemplate: true,
        templateKind: TemplateKind.INVOICE,
        contentFormat: 'HTML',
        content: DEFAULT_INVOICE_TEMPLATE,
      });
      await this.documentsRepository.create({
        tenantId: event.tenantId,
        type: 'BILLING',
        title: 'Recibo de dinero (plantilla)',
        description: 'Plantilla usada para generar el PDF al cobrar una cuota.',
        visibility: 'PUBLIC',
        isTemplate: true,
        templateKind: TemplateKind.PAYMENT_RECEIPT,
        contentFormat: 'HTML',
        content: DEFAULT_PAYMENT_RECEIPT_TEMPLATE,
      });
    } catch (error) {
      this.logger.error(
        `No se pudieron sembrar las plantillas de facturación para el tenant ${event.tenantId}: ${(error as Error).message}`,
      );
    }
  }
}
