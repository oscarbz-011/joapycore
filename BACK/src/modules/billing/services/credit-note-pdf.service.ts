import { Injectable, Logger } from '@nestjs/common';
import { numberToWordsEs } from '../../../common/utils/number-to-words.util';
import { FilesService } from '../../../files/files.service';
import { PdfService } from '../../../files/pdf/pdf.service';
import { CREDIT_NOTE_TEMPLATE } from '../constants/credit-note-template';
import { CreditNotesRepository } from '../repositories/credit-notes.repository';
import { buildCreditNoteReceipt } from '../utils/fiscal-receipt.util';

const money = (value: number) =>
  value.toLocaleString('es-PY', { maximumFractionDigits: 0 });

const calendarDate = (value: Date | null) =>
  value
    ? value.toLocaleDateString('es-PY', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : '';

const localDate = (value: Date | null) =>
  value
    ? value.toLocaleDateString('es-PY', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: 'America/Asuncion',
      })
    : '';

/** PDF A4 de una nota de crédito de impresión propia. */
@Injectable()
export class CreditNotePdfService {
  private readonly logger = new Logger(CreditNotePdfService.name);

  constructor(
    private readonly creditNotes: CreditNotesRepository,
    private readonly filesService: FilesService,
    private readonly pdfService: PdfService,
  ) {}

  /** Devuelve el archivo del PDF; si ya existía, no lo vuelve a generar. */
  async generate(
    tenantId: string,
    creditNoteId: string,
    requestedById: string | null,
  ): Promise<string | null> {
    const note = await this.creditNotes.findForReceipt(tenantId, creditNoteId);
    if (!note || note.modality !== 'SELF_PRINTED') return null;
    if (note.pdfFileId) return note.pdfFileId;

    const receipt = buildCreditNoteReceipt(note);
    const rows = receipt.lines.map((line) => [
      line.description,
      String(line.quantity),
      money(line.unitPrice),
      line.ivaRate !== 5 && line.ivaRate !== 10 ? money(line.total) : '',
      line.ivaRate === 5 ? money(line.total) : '',
      line.ivaRate === 10 ? money(line.total) : '',
    ]);
    const { totals, issuer, buyer } = receipt;
    const variables: Record<string, string> = {
      'tenant.razonSocial': issuer.name,
      'tenant.actividad': issuer.activity ?? '',
      'tenant.direccion':
        [issuer.address, issuer.city].filter(Boolean).join(' — ') || '',
      'tenant.telefono': issuer.phone ?? '',
      'tenant.ruc': issuer.ruc ?? '',
      'timbrado.numero': receipt.timbrado ?? '',
      'timbrado.inicioVigencia': calendarDate(receipt.timbradoValidFrom),
      'timbrado.finVigencia': calendarDate(receipt.timbradoValidUntil),
      'nota.numero': receipt.number,
      'nota.fechaEmision': localDate(receipt.issuedAt),
      'nota.facturaModificada': receipt.relatedDocument ?? '',
      'nota.motivo': note.reason,
      'cliente.nombre': buyer.name,
      'cliente.documento': buyer.document,
      'cliente.direccion': buyer.address ?? '',
      'nota.subtotalExentas': money(totals.exempt),
      'nota.subtotal5': money(totals.taxed5),
      'nota.subtotal10': money(totals.taxed10),
      'nota.iva5': money(totals.iva5),
      'nota.iva10': money(totals.iva10),
      'nota.totalIva': money(totals.ivaTotal),
      'nota.total': money(totals.total),
      'nota.totalEnLetras': numberToWordsEs(totals.total),
    };

    const logo = await this.logoDataUri(
      tenantId,
      note.invoice.tenant.logoFileId,
    );
    const buffer = await this.pdfService.renderHtmlTemplate(
      CREDIT_NOTE_TEMPLATE,
      variables,
      {
        'nota.items': {
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
      },
      {
        'tenant.logo': logo ? `<img class="company-logo" src="${logo}" />` : '',
      },
      'A4',
    );

    const file = await this.filesService.upload(
      tenantId,
      requestedById ?? undefined,
      {
        buffer,
        originalname: `nota-de-credito-${receipt.number || note.id}.pdf`,
        mimetype: 'application/pdf',
        size: buffer.length,
      },
      { module: 'billing', entityType: 'CreditNote', entityId: note.id },
    );
    await this.creditNotes.setPdf(tenantId, note.id, file.id);
    return file.id;
  }

  private async logoDataUri(
    tenantId: string,
    logoFileId: string | null,
  ): Promise<string | null> {
    if (!logoFileId) return null;
    try {
      const record = await this.filesService.getById(tenantId, logoFileId);
      const buffer = await this.filesService.getFileBuffer(record);
      return `data:${record.mimeType};base64,${buffer.toString('base64')}`;
    } catch (error) {
      this.logger.warn(
        `No se pudo cargar el logo para la nota de crédito: ${(error as Error).message}`,
      );
      return null;
    }
  }
}
