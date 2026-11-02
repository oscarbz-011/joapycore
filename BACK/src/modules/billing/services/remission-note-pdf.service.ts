import { Injectable, Logger } from '@nestjs/common';
import { FilesService } from '../../../files/files.service';
import { PdfService } from '../../../files/pdf/pdf.service';
import {
  REMISSION_COPIES,
  remissionNoteTemplate,
} from '../constants/remission-note-template';
import {
  RemissionNotePrintSource,
  RemissionNotesRepository,
} from '../repositories/remission-notes.repository';
import { REMISSION_MOTIVE_LABELS } from '../utils/remission-note.util';

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

function firstActivity(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) return '';
  const first = value[0] as { descripcion?: unknown };
  return typeof first?.descripcion === 'string' ? first.descripcion : '';
}

/** Ejemplares que se imprimen: el del transportista solo si el flete es contratado. */
export function remissionCopies(
  note: Pick<RemissionNotePrintSource, 'transportType'>,
) {
  const copies: string[] = [
    REMISSION_COPIES.original,
    REMISSION_COPIES.sender,
    REMISSION_COPIES.tax,
  ];
  if (note.transportType === 'THIRD_PARTY')
    copies.push(REMISSION_COPIES.carrier);
  return copies;
}

export function remissionVariables(note: RemissionNotePrintSource) {
  const tenant = note.tenant;
  const join = (...parts: (string | null | undefined)[]) =>
    parts.filter(Boolean).join(' ');
  const invoice = note.invoice;
  const motive =
    note.motive === 'OTHER' && note.motiveDetail
      ? `Otros: ${note.motiveDetail}`
      : REMISSION_MOTIVE_LABELS[note.motive];
  return {
    'tenant.razonSocial': tenant.razonSocial ?? tenant.name,
    'tenant.actividad': firstActivity(tenant.actividadesEconomicas),
    'tenant.direccion': [join(tenant.address, tenant.numeroCasa), tenant.city]
      .filter(Boolean)
      .join(' — '),
    'tenant.sucursal': note.branch
      ? `Sucursal ${note.branch.name}: ${[join(note.branch.address, note.branch.numeroCasa), note.branch.city].filter(Boolean).join(' — ')}`
      : '',
    'tenant.telefono': tenant.phone ?? '',
    'tenant.ruc': tenant.ruc ?? '',
    'timbrado.numero': note.timbrado,
    'timbrado.inicioVigencia': calendarDate(note.timbradoValidFrom),
    'timbrado.finVigencia': calendarDate(note.timbradoValidUntil),
    'nota.numero': `${note.numberPrefix}${note.number}`,
    'nota.fechaEmision': localDate(note.issuedAt),
    'nota.motivo': motive,
    'nota.comprobante': invoice
      ? `Factura N° ${invoice.invoicePrefix ?? ''}${invoice.invoiceNumber ?? ''} · Timbrado ${invoice.timbrado ?? ''} · ${localDate(invoice.issuedAt)}`
      : 'No corresponde',
    'nota.observaciones': note.notes ?? '',
    'destinatario.nombre': note.recipientName,
    'destinatario.documento': note.recipientDocument,
    'partida.direccion': note.originAddress,
    'partida.ciudad': note.originCity ?? '',
    'partida.departamento': note.originDepartment ?? '',
    'llegada.direccion': note.destinationAddress,
    'llegada.ciudad': note.destinationCity ?? '',
    'llegada.departamento': note.destinationDepartment ?? '',
    'traslado.inicio': calendarDate(note.transportStartDate),
    'traslado.fin': calendarDate(note.transportEndDate),
    'vehiculo.marca': note.vehicleBrand,
    'vehiculo.chapa': note.vehiclePlate,
    'vehiculo.remolque': note.trailerPlate
      ? `Remolque: ${note.trailerPlate}`
      : '',
    'transportista.nombre': note.carrierName,
    'transportista.ruc': note.carrierRuc,
    'transportista.domicilio': note.carrierAddress,
    'conductor.nombre': note.driverName,
    'conductor.documento': note.driverDocument,
    'conductor.direccion': note.driverAddress,
  };
}

/** PDF A4 de una nota de remisión de impresión propia, con todos sus ejemplares. */
@Injectable()
export class RemissionNotePdfService {
  private readonly logger = new Logger(RemissionNotePdfService.name);

  constructor(
    private readonly notes: RemissionNotesRepository,
    private readonly filesService: FilesService,
    private readonly pdfService: PdfService,
  ) {}

  /** Devuelve el archivo del PDF; si ya existía, no lo vuelve a generar. */
  async generate(
    tenantId: string,
    remissionNoteId: string,
    requestedById: string | null,
  ): Promise<string | null> {
    const note = await this.notes.findForPrint(tenantId, remissionNoteId);
    if (!note || note.modality !== 'SELF_PRINTED') return null;
    if (note.pdfFileId) return note.pdfFileId;

    const logo = await this.logoDataUri(tenantId, note.tenant.logoFileId);
    const buffer = await this.pdfService.renderHtmlTemplate(
      remissionNoteTemplate(remissionCopies(note)),
      remissionVariables(note),
      {
        'nota.items': {
          headers: ['Cantidad', 'Unidad', 'Descripción', 'N° de serie'],
          rows: note.items.map((item) => [
            String(item.quantity),
            item.unit,
            item.description,
            item.serialNumbers.join(', '),
          ]),
        },
      },
      {
        'tenant.logo': logo ? `<img class="company-logo" src="${logo}" />` : '',
      },
      'A4',
    );

    const number = `${note.numberPrefix}${note.number}`;
    const file = await this.filesService.upload(
      tenantId,
      requestedById ?? undefined,
      {
        buffer,
        originalname: `nota-de-remision-${number}.pdf`,
        mimetype: 'application/pdf',
        size: buffer.length,
      },
      { module: 'billing', entityType: 'RemissionNote', entityId: note.id },
    );
    await this.notes.setPdf(tenantId, note.id, file.id);
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
        `No se pudo cargar el logo para la nota de remisión: ${(error as Error).message}`,
      );
      return null;
    }
  }
}
