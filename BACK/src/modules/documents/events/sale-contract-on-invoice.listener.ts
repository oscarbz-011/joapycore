import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DocType, TemplateKind } from '@prisma/client';
import { FilesService } from '../../../files/files.service';
import { PdfService } from '../../../files/pdf/pdf.service';
import type { PdfTableVariable } from '../../../files/pdf/tiptap-to-html.converter';
import { PrismaService } from '../../../prisma/prisma.service';
import { numberToWordsEs } from '../../../common/utils/number-to-words.util';
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
  if (!value) return '';
  return value.toLocaleDateString('es-PY', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

const MESES_ES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

// Formato legal habitual de cierre de contrato: "25 días del mes de julio
// del año 2026" — separado de formatDate() porque las cláusulas del
// contrato necesitan el día en formato largo, no dd/mm/aaaa.
function formatDateLong(value: Date | null | undefined): string {
  if (!value) return '';
  return `${value.getDate()} días del mes de ${MESES_ES[value.getMonth()]} del año ${value.getFullYear()}`;
}

// Arma el plan de cuotas en dos bloques de columnas lado a lado (cuotas
// 1..mitad a la izquierda, mitad+1..N a la derecha) en vez de una fila por
// cuota — formato habitual en contratos impresos para no alargar tanto la
// tabla verticalmente con planes de muchas cuotas. Si la cantidad es impar,
// la última fila del bloque derecho queda vacía.
function buildPairedInstallmentsTable(
  installments: { number: number; dueDate: Date; amount: unknown }[],
): PdfTableVariable {
  const half = Math.ceil(installments.length / 2);
  const left = installments.slice(0, half);
  const right = installments.slice(half);
  return {
    headers: [
      'Nro.cuota',
      'Fecha vencimiento',
      'Importe cuota',
      'Nro.cuota',
      'Fecha vencimiento',
      'Importe cuota',
    ],
    rows: left.map((inst, i) => {
      const pair = right[i];
      return [
        String(inst.number),
        formatDate(inst.dueDate),
        formatMoney(inst.amount),
        pair ? String(pair.number) : '',
        pair ? formatDate(pair.dueDate) : '',
        pair ? formatMoney(pair.amount) : '',
      ];
    }),
  };
}

// Precio con interés ya aplicado cuando existe (ventas a crédito) — cae al
// precio contado para ventas al contado o ítems creados antes de este campo.
function effectiveUnitPrice(item: {
  unitPrice: unknown;
  financedUnitPrice?: unknown;
}): number {
  return item.financedUnitPrice != null
    ? Number(item.financedUnitPrice)
    : Number(item.unitPrice);
}

// Genera automáticamente el contrato de compra-venta cuando se emite la
// factura de una venta a crédito. Best-effort e idempotente: nunca debe
// impedir que la factura se emita, y no duplica el contrato en reintentos.
@Injectable()
export class SaleContractOnInvoiceListener {
  private readonly logger = new Logger(SaleContractOnInvoiceListener.name);

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
        `No se pudo generar el contrato automático para la venta ${event.saleOrderId}: ${(error as Error).message}`,
      );
    }
  }

  private async generate(event: InvoiceIssuedEvent) {
    if (!event.saleOrderId) return;

    const saleOrder = await this.prisma.saleOrder.findFirst({
      where: { id: event.saleOrderId, tenantId: event.tenantId },
      include: {
        tenant: true,
        customer: true,
        branch: true,
        items: { include: { product: true } },
        loan: { include: { installments: { orderBy: { number: 'asc' } } } },
        downPayment: true,
        invoice: true,
        guarantors: { orderBy: { createdAt: 'asc' } },
      },
    });

    // Robusto ante el paymentCondition del propio evento: se decide por el
    // tipo real de la venta, no por lo que declaró quien emitió la factura.
    if (!saleOrder || saleOrder.saleType !== 'CREDIT') return;

    const alreadyExists = await this.documentsRepository.findAll(
      event.tenantId,
      {
        entityType: 'sale_order',
        entityId: saleOrder.id,
        type: DocType.CONTRACT,
      },
    );
    if (alreadyExists.length > 0) return;

    const template = await this.documentsRepository.findTemplate(
      event.tenantId,
      TemplateKind.SALE_CONTRACT,
    );
    if (!template?.content) {
      this.logger.warn(
        `Venta ${saleOrder.id} es a crédito pero el tenant ${event.tenantId} no tiene una plantilla de contrato configurada`,
      );
      return;
    }

    const customerName = [
      saleOrder.customer.firstName,
      saleOrder.customer.secondFirstName,
      saleOrder.customer.lastName,
      saleOrder.customer.secondLastName,
    ]
      .filter(Boolean)
      .join(' ');

    // Solo el primer garante alimenta las variables planas — la cláusula de
    // garantía del contrato está escrita en prosa para uno solo. Si el
    // pedido no tiene garante, quedan vacías (el tenant ajusta la cláusula
    // en su plantilla si no siempre aplica).
    const guarantor = saleOrder.guarantors[0];

    const variables: Record<string, string> = {
      'tenant.razonSocial':
        saleOrder.tenant.razonSocial ?? saleOrder.tenant.name,
      'tenant.ruc': saleOrder.tenant.ruc ?? '',
      'tenant.direccion': saleOrder.tenant.address ?? '',
      'cliente.nombre': customerName,
      'cliente.documento': saleOrder.customer.documentNumber ?? '',
      'cliente.email': saleOrder.customer.email ?? '',
      'cliente.telefono': saleOrder.customer.phone ?? '',
      'cliente.direccion': saleOrder.customer.address ?? '',
      'sucursal.ciudad': saleOrder.branch?.city ?? '',
      'venta.fecha': formatDate(saleOrder.orderDate),
      'venta.fechaLarga': formatDateLong(saleOrder.orderDate),
      'venta.total': saleOrder.total ? formatMoney(saleOrder.total) : '',
      'venta.totalEnLetras': saleOrder.total
        ? numberToWordsEs(Number(saleOrder.total))
        : '',
      'factura.numero': [
        saleOrder.invoice?.invoicePrefix,
        saleOrder.invoice?.invoiceNumber,
      ]
        .filter(Boolean)
        .join('-'),
      'factura.fecha': formatDate(saleOrder.invoice?.issuedAt),
      'credito.entrega': saleOrder.downPayment
        ? formatMoney(saleOrder.downPayment.amount)
        : '0',
      'credito.montoFinanciado': saleOrder.loan
        ? formatMoney(saleOrder.loan.principal)
        : '',
      'credito.tasaInteres': saleOrder.loan
        ? `${Number(saleOrder.loan.interestRate)}%`
        : '',
      'credito.cantidadCuotas': saleOrder.loan
        ? String(saleOrder.loan.totalInstallments)
        : '',
      'credito.cuotaMensual': saleOrder.loan?.installments[0]
        ? formatMoney(saleOrder.loan.installments[0].amount)
        : '',
      'credito.montoTotal': saleOrder.loan
        ? formatMoney(saleOrder.loan.totalAmount)
        : '',
      'garante.nombre': guarantor
        ? `${guarantor.firstName} ${guarantor.lastName}`
        : '',
      'garante.documento': guarantor
        ? `${guarantor.documentType}: ${guarantor.documentNumber}`
        : '',
      'garante.direccion': guarantor?.address ?? '',
      'garante.telefono': guarantor?.phone ?? '',
      'garante.email': guarantor?.email ?? '',
    };

    const tableVariables: Record<string, PdfTableVariable> = {
      'venta.items': {
        headers: ['Producto', 'Cantidad', 'Precio unitario', 'Subtotal'],
        rows: saleOrder.items.map((item) => {
          const unitPrice = effectiveUnitPrice(item);
          return [
            item.product?.name ?? item.description ?? '—',
            String(item.quantity),
            formatMoney(unitPrice),
            formatMoney(unitPrice * item.quantity),
          ];
        }),
      },
      'credito.cuotas': {
        headers: ['Nro. cuota', 'Fecha vencimiento', 'Importe cuota'],
        rows: (saleOrder.loan?.installments ?? []).map((inst) => [
          String(inst.number),
          formatDate(inst.dueDate),
          formatMoney(inst.amount),
        ]),
      },
      'credito.cuotasDosColumnas': buildPairedInstallmentsTable(
        saleOrder.loan?.installments ?? [],
      ),
    };

    // Best-effort: si el logo no se puede resolver (borrado, error de
    // storage, etc.) el contrato se genera igual, solo que sin encabezado.
    let logoDataUri: string | undefined;
    if (saleOrder.tenant.logoFileId) {
      try {
        const logoRecord = await this.filesService.getById(
          event.tenantId,
          saleOrder.tenant.logoFileId,
        );
        const logoBuffer = await this.filesService.getFileBuffer(logoRecord);
        logoDataUri = `data:${logoRecord.mimeType};base64,${logoBuffer.toString('base64')}`;
      } catch (error) {
        this.logger.warn(
          `No se pudo cargar el logo del tenant ${event.tenantId} para el contrato: ${(error as Error).message}`,
        );
      }
    }

    const pdfBuffer = await this.pdfService.renderTemplate(
      template.content,
      variables,
      tableVariables,
      {
        logoDataUri,
        companyName: saleOrder.tenant.razonSocial ?? saleOrder.tenant.name,
      },
    );

    const fileRecord = await this.filesService.upload(
      event.tenantId,
      event.issuedById,
      {
        buffer: pdfBuffer,
        originalname: `contrato-${customerName || saleOrder.id}.pdf`,
        mimetype: 'application/pdf',
        size: pdfBuffer.length,
      },
      { module: 'documents', entityType: 'sale_order', entityId: saleOrder.id },
    );

    await this.documentsRepository.create({
      tenantId: event.tenantId,
      type: DocType.CONTRACT,
      title: `Contrato de venta — ${customerName || saleOrder.id}`,
      categoryId: template.categoryId ?? undefined,
      visibility: template.visibility,
      allowedRoles: template.allowedRoles,
      entityType: 'sale_order',
      entityId: saleOrder.id,
      content: template.content,
      variables,
      fileRecordId: fileRecord.id,
      uploadedById: event.issuedById,
    });
  }
}
