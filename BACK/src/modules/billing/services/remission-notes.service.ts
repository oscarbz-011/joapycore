import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  BillingDocumentType,
  BillingEventType,
  Prisma,
  RemissionMotive,
  RemissionNoteStatus,
  RemissionTransitStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import type { AuditLogEvent } from '../../../audit/audit-log.event';
import {
  STOCK_LEDGER,
  type StockLedger,
} from '../../../common/contracts/stock-ledger.contract';
import { EventBus } from '../../../common/events/event-bus';
import { FilesService } from '../../../files/files.service';
import { OutboxService } from '../../../outbox/outbox.service';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  IssueSaleRemissionDto,
  IssueTransferRemissionDto,
  ReceiveRemissionDto,
  VoidRemissionDto,
} from '../dto/remission-note.dto';
import { BillingEventsRepository } from '../repositories/billing-events.repository';
import { BillingSourcesRepository } from '../repositories/billing-sources.repository';
import { InvoicesRepository } from '../repositories/invoices.repository';
import { RemissionNotesRepository } from '../repositories/remission-notes.repository';
import {
  buildReception,
  buildSaleLines,
  buildTransferLines,
  goodsDescription,
  type RemissionLine,
  remitableItems,
  transportDates,
} from '../utils/remission-note.util';
import { BillingSeriesService } from './billing-series.service';
import { RemissionNotePdfService } from './remission-note-pdf.service';

type Tx = Prisma.TransactionClient;
type InvoiceForRemission = NonNullable<
  Awaited<ReturnType<InvoicesRepository['findForRemission']>>
>;
type IssueBase = IssueTransferRemissionDto | IssueSaleRemissionDto;

interface PlaceRow {
  address: string | null;
  numeroCasa: string | null;
  city: string | null;
  ciudadDesc?: string | null;
  departamentoDesc: string | null;
}

const DOCUMENT_LABELS: Record<string, string> = {
  CI: 'CI',
  RUC: 'RUC',
  PASSPORT: 'Pasaporte',
};

const isDuplicate = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === 'P2002';

/** Dirección sugerida para el punto de partida o de llegada. */
export function placeOf(row: PlaceRow | null | undefined) {
  if (!row) return { address: '', city: '', department: '' };
  return {
    address: [row.address, row.numeroCasa].filter(Boolean).join(' '),
    city: row.ciudadDesc ?? row.city ?? '',
    department: row.departamentoDesc ?? '',
  };
}

function recipientOf(invoice: InvoiceForRemission) {
  const customer = invoice.anonymousBuyer
    ? null
    : (invoice.saleOrder?.customer ?? null);
  if (!customer) return { customerId: null, name: '', document: '' };
  const name =
    customer.taxpayerType === 'COMPANY'
      ? customer.firstName
      : [
          customer.firstName,
          customer.secondFirstName,
          customer.lastName,
          customer.secondLastName,
        ]
          .filter(Boolean)
          .join(' ');
  return {
    customerId: customer.id,
    name,
    document: customer.documentNumber
      ? `${DOCUMENT_LABELS[customer.documentType ?? 'CI'] ?? ''} ${customer.documentNumber}`.trim()
      : '',
  };
}

function assertRemitable(invoice: InvoiceForRemission) {
  if (invoice.status === 'PENDING') {
    throw new UnprocessableEntityException(
      'La factura todavía no se emitió: la nota de remisión cita una factura emitida',
    );
  }
  if (invoice.status === 'CANCELLED') {
    throw new UnprocessableEntityException('La factura está anulada');
  }
  if (invoice.invoiceType !== 'SALE') {
    throw new UnprocessableEntityException(
      'Solo una factura de venta lleva mercadería',
    );
  }
}

const invoiceNumber = (invoice: {
  invoicePrefix: string | null;
  invoiceNumber: string | null;
}) => `${invoice.invoicePrefix ?? ''}${invoice.invoiceNumber ?? ''}`;

/**
 * Notas de remisión (arts. 30–48 del Decreto 6539/05). Respaldan el traslado
 * de mercadería: entre sucursales son obligatorias y mueven el stock; en una
 * venta son opcionales (art. 38) y solo documentan el envío.
 */
@Injectable()
export class RemissionNotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notes: RemissionNotesRepository,
    private readonly invoicesRepository: InvoicesRepository,
    private readonly sources: BillingSourcesRepository,
    private readonly events: BillingEventsRepository,
    private readonly seriesService: BillingSeriesService,
    private readonly pdf: RemissionNotePdfService,
    private readonly filesService: FilesService,
    private readonly outbox: OutboxService,
    private readonly eventBus: EventBus,
    @Inject(STOCK_LEDGER) private readonly stockLedger: StockLedger,
  ) {}

  findAll(tenantId: string) {
    return this.notes.findAll(tenantId);
  }

  findByInvoice(tenantId: string, invoiceId: string) {
    return this.notes.findByInvoice(tenantId, invoiceId);
  }

  async findOne(tenantId: string, id: string) {
    const note = await this.notes.findById(tenantId, id);
    if (!note) throw new NotFoundException('Nota de remisión no encontrada');
    const events = await this.events.findByRemissionNote(tenantId, id);
    return { ...note, events };
  }

  /** Depósitos, datos de la empresa y series para trasladar entre sucursales. */
  async transferOptions(tenantId: string) {
    const [warehouses, company, series] = await Promise.all([
      this.sources.findWarehousesForRemission(tenantId, null),
      this.company(tenantId),
      this.seriesService.findIssueOptions(
        tenantId,
        null,
        new Date(),
        BillingDocumentType.REMISSION_NOTE,
      ),
    ]);
    return {
      company,
      warehouses: warehouses.map((w) => ({
        id: w.id,
        name: w.name,
        branch: w.branch ? { id: w.branch.id, name: w.branch.name } : null,
        place: w.address
          ? { ...placeOf(w.branch), address: w.address }
          : placeOf(w.branch),
      })),
      series,
    };
  }

  /** Lo que se puede trasladar desde un depósito: saldo y N/S libres. */
  async transferStock(tenantId: string, warehouseId: string) {
    const [warehouse] = await this.sources.findWarehousesForRemission(
      tenantId,
      [warehouseId],
    );
    if (!warehouse) throw new NotFoundException('Depósito no encontrado');
    const available = await this.prisma.$transaction((tx) =>
      this.stockLedger.availableIn(tx, tenantId, warehouseId),
    );
    const products = await this.sources.findProductsForRemission(
      tenantId,
      available.map((a) => a.productId),
    );
    const byId = new Map(products.map((p) => [p.id, p]));
    return available
      .flatMap((stock) => {
        const product = byId.get(stock.productId);
        if (!product) return [];
        return [
          {
            productId: product.id,
            description: goodsDescription(product),
            unit: product.unit,
            isSerialized: product.isSerialized,
            quantity: product.isSerialized
              ? stock.serialNumbers.length
              : stock.quantity,
            serialNumbers: product.isSerialized ? stock.serialNumbers : [],
          },
        ];
      })
      .filter((row) => row.quantity > 0)
      .sort((a, b) => a.description.localeCompare(b.description, 'es'));
  }

  /** Lo que se puede enviar de una factura y con qué serie. */
  async saleOptions(tenantId: string, invoiceId: string) {
    const invoice = await this.invoicesRepository.findForRemission(
      tenantId,
      invoiceId,
    );
    if (!invoice) throw new NotFoundException('Factura no encontrada');
    assertRemitable(invoice);
    const branchId = invoice.series?.branchId ?? invoice.saleOrder?.branchId;
    const [items, branch, company, series] = await Promise.all([
      this.remitable(this.prisma, tenantId, invoice),
      branchId
        ? this.sources.findBranchForRemission(tenantId, branchId)
        : Promise.resolve(null),
      this.company(tenantId),
      this.seriesService.findIssueOptions(
        tenantId,
        branchId ?? null,
        new Date(),
        BillingDocumentType.REMISSION_NOTE,
      ),
    ]);
    const recipient = recipientOf(invoice);
    const customer = invoice.anonymousBuyer
      ? null
      : (invoice.saleOrder?.customer ?? null);
    return {
      invoice: {
        id: invoice.id,
        number: invoiceNumber(invoice),
        issuedAt: invoice.issuedAt,
        anonymousBuyer: invoice.anonymousBuyer,
      },
      recipient: { name: recipient.name, document: recipient.document },
      origin: placeOf(branch),
      destination: {
        address: customer?.address ?? '',
        city: customer?.city ?? '',
        department: '',
      },
      company,
      items,
      series,
    };
  }

  async issueTransfer(
    tenantId: string,
    dto: IssueTransferRemissionDto,
    userId?: string,
  ) {
    const now = new Date();
    const dates = transportDates(
      dto.transport.startDate,
      dto.transport.endDate,
      now,
    );
    if (dto.fromWarehouseId === dto.toWarehouseId) {
      throw new UnprocessableEntityException(
        'Los depósitos de origen y destino deben ser distintos',
      );
    }

    const created = await this.saveUnique(() =>
      this.prisma.$transaction(async (tx) => {
        const warehouses = await this.sources.findWarehousesForRemission(
          tenantId,
          [dto.fromWarehouseId, dto.toWarehouseId],
          tx,
        );
        const from = warehouses.find((w) => w.id === dto.fromWarehouseId);
        const to = warehouses.find((w) => w.id === dto.toWarehouseId);
        if (!from || !to) throw new NotFoundException('Depósito no encontrado');
        if (!from.branch) {
          throw new UnprocessableEntityException(
            `El depósito ${from.name} no pertenece a una sucursal: asignale una para emitir la nota desde su establecimiento`,
          );
        }
        const products = await this.sources.findProductsForRemission(
          tenantId,
          [...new Set(dto.items.map((i) => i.productId))],
          tx,
        );
        const lines = buildTransferLines(dto.items, products);
        const company = await this.company(tenantId, tx);
        if (!company.ruc) {
          throw new UnprocessableEntityException(
            'Cargá el RUC de la empresa en Configuración: es el destinatario del traslado',
          );
        }

        const note = await this.create(tx, {
          tenantId,
          userId,
          now,
          dto,
          dates,
          branchId: from.branch.id,
          motive: RemissionMotive.BRANCH_TRANSFER,
          recipient: {
            customerId: null,
            name: company.name,
            document: `RUC ${company.ruc}`,
          },
          invoiceId: null,
          fromWarehouseId: from.id,
          toWarehouseId: to.id,
          transitStatus: RemissionTransitStatus.IN_TRANSIT,
          lines,
        });
        await this.stockLedger.dispatch(tx, tenantId, {
          referenceId: note.id,
          fromWarehouseId: from.id,
          toWarehouseId: to.id,
          notes: `Nota de remisión ${note.number}`,
          lines: lines.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
            serialNumbers: l.serialNumbers,
          })),
        });
        return note;
      }),
    );

    await this.afterIssue(tenantId, created, userId);
    return this.findOne(tenantId, created.id);
  }

  async issueForSale(
    tenantId: string,
    invoiceId: string,
    dto: IssueSaleRemissionDto,
    userId?: string,
  ) {
    const now = new Date();
    const dates = transportDates(
      dto.transport.startDate,
      dto.transport.endDate,
      now,
    );

    const created = await this.saveUnique(() =>
      this.prisma.$transaction(async (tx) => {
        const invoice = await this.invoicesRepository.findForRemission(
          tenantId,
          invoiceId,
          tx,
        );
        if (!invoice) throw new NotFoundException('Factura no encontrada');
        assertRemitable(invoice);
        const available = await this.remitable(tx, tenantId, invoice);
        const lines = buildSaleLines(dto.items, available);
        const branchId =
          invoice.series?.branchId ?? invoice.saleOrder?.branchId ?? null;
        if (!branchId) {
          throw new UnprocessableEntityException(
            'La factura no tiene sucursal: no se sabe desde qué establecimiento se emite la nota',
          );
        }
        return this.create(tx, {
          tenantId,
          userId,
          now,
          dto,
          dates,
          branchId,
          motive: RemissionMotive.SALE,
          recipient: {
            customerId: recipientOf(invoice).customerId,
            name: dto.recipientName.trim(),
            document: dto.recipientDocument.trim(),
          },
          invoiceId: invoice.id,
          fromWarehouseId: null,
          toWarehouseId: null,
          transitStatus: null,
          lines,
        });
      }),
    );

    await this.afterIssue(tenantId, created, userId);
    return this.findOne(tenantId, created.id);
  }

  /**
   * Registra lo que llegó al depósito de destino: entra al stock y lo que
   * falta queda como faltante del traslado, con su explicación.
   */
  async receive(
    tenantId: string,
    id: string,
    dto: ReceiveRemissionDto,
    userId?: string,
  ) {
    const at = new Date();
    const notes = dto.notes?.trim() || null;
    let differences = false;
    await this.prisma.$transaction(async (tx) => {
      const note = await this.notes.findById(tenantId, id, tx);
      if (!note) throw new NotFoundException('Nota de remisión no encontrada');
      if (
        note.motive !== RemissionMotive.BRANCH_TRANSFER ||
        !note.toWarehouse
      ) {
        throw new UnprocessableEntityException(
          'Solo un traslado entre depósitos se recibe en el destino',
        );
      }
      if (note.status === RemissionNoteStatus.VOIDED) {
        throw new UnprocessableEntityException('La nota está anulada');
      }
      if (note.transitStatus !== RemissionTransitStatus.IN_TRANSIT) {
        throw new UnprocessableEntityException(
          'La mercadería de esta nota ya se recibió',
        );
      }
      const plan = buildReception(note.items, dto.items, notes ?? undefined);
      differences = plan.hasDifferences;

      const marked = await this.notes.markReceived(
        tenantId,
        id,
        {
          transitStatus: plan.hasDifferences
            ? RemissionTransitStatus.RECEIVED_WITH_DIFFERENCES
            : RemissionTransitStatus.RECEIVED,
          at,
          userId: userId ?? null,
          notes,
        },
        tx,
      );
      if (marked.count !== 1) {
        throw new ConflictException(
          'La nota cambió mientras se registraba la recepción. Recargá e intentá de nuevo.',
        );
      }
      for (const item of plan.items) {
        await this.notes.setItemReceived(
          tenantId,
          item.itemId,
          { quantity: item.quantity, serialNumbers: item.serialNumbers },
          tx,
        );
      }
      await this.stockLedger.receive(tx, tenantId, {
        referenceId: note.id,
        warehouseId: note.toWarehouse.id,
        notes: `Recepción de la nota de remisión ${note.numberPrefix}${note.number}`,
        lines: plan.received,
        lostSerials: plan.lost,
      });
      await this.events.record(
        {
          tenantId,
          remissionNoteId: id,
          type: BillingEventType.REMISSION_RECEIVED,
          userId,
          detail: { differences: plan.hasDifferences, notes },
        },
        tx,
      );
    });

    this.eventBus.emit('audit.log', {
      tenantId,
      userId,
      module: 'billing',
      action: 'remission-note.received',
      resourceId: id,
      after: { differences },
    } satisfies AuditLogEvent);
    return this.findOne(tenantId, id);
  }

  /**
   * Anula una nota vigente. Un traslado solo mientras está en tránsito: la
   * mercadería vuelve al depósito de origen.
   */
  async voidNote(
    tenantId: string,
    id: string,
    dto: VoidRemissionDto,
    userId?: string,
  ) {
    const reason = dto.reason.trim();
    const at = new Date();
    await this.prisma.$transaction(async (tx) => {
      const note = await this.notes.findById(tenantId, id, tx);
      if (!note) throw new NotFoundException('Nota de remisión no encontrada');
      if (note.status === RemissionNoteStatus.VOIDED) {
        throw new UnprocessableEntityException('La nota ya está anulada');
      }
      const isTransfer = note.motive === RemissionMotive.BRANCH_TRANSFER;
      if (
        isTransfer &&
        note.transitStatus !== RemissionTransitStatus.IN_TRANSIT
      ) {
        throw new UnprocessableEntityException(
          'La mercadería ya se recibió en el destino: para devolverla, emití una nota de remisión de vuelta',
        );
      }
      const voided = await this.notes.voidIfIssued(
        tenantId,
        id,
        { reason, at, userId: userId ?? null },
        isTransfer,
        tx,
      );
      if (voided.count !== 1) {
        throw new ConflictException(
          'La nota cambió mientras se anulaba. Recargá e intentá de nuevo.',
        );
      }
      if (isTransfer && note.fromWarehouse) {
        await this.stockLedger.receive(tx, tenantId, {
          referenceId: note.id,
          warehouseId: note.fromWarehouse.id,
          notes: `Anulación de la nota de remisión ${note.numberPrefix}${note.number}`,
          lines: note.items
            .filter((item) => item.productId)
            .map((item) => ({
              productId: item.productId as string,
              quantity: item.quantity,
              serialNumbers: item.serialNumbers,
            })),
          lostSerials: [],
        });
      }
      await this.events.record(
        {
          tenantId,
          remissionNoteId: id,
          invoiceId: note.invoice?.id ?? null,
          type: BillingEventType.VOIDED,
          userId,
          detail: { reason },
        },
        tx,
      );
    });

    this.eventBus.emit('audit.log', {
      tenantId,
      userId,
      module: 'billing',
      action: 'remission-note.voided',
      resourceId: id,
      after: { reason },
    } satisfies AuditLogEvent);
    return this.findOne(tenantId, id);
  }

  async setPhysicalScan(
    tenantId: string,
    id: string,
    fileId: string | null,
    userId?: string,
  ) {
    const note = await this.notes.findById(tenantId, id);
    if (!note) throw new NotFoundException('Nota de remisión no encontrada');
    if (fileId) await this.filesService.getById(tenantId, fileId);
    await this.prisma.$transaction(async (tx) => {
      await this.notes.setPhysicalScan(tenantId, id, fileId, tx);
      await this.events.record(
        {
          tenantId,
          remissionNoteId: id,
          type: fileId
            ? BillingEventType.SCAN_ATTACHED
            : BillingEventType.SCAN_REMOVED,
          userId,
        },
        tx,
      );
    });
    return this.findOne(tenantId, id);
  }

  async retryPdf(tenantId: string, id: string, userId?: string) {
    const note = await this.notes.findById(tenantId, id);
    if (!note) throw new NotFoundException('Nota de remisión no encontrada');
    if (note.modality !== 'SELF_PRINTED') {
      throw new UnprocessableEntityException(
        'La nota de talonario es la hoja llenada a mano: no tiene PDF',
      );
    }
    await this.pdf.generate(tenantId, id, userId ?? null);
    return this.findOne(tenantId, id);
  }

  private async remitable(
    client: Tx | PrismaService,
    tenantId: string,
    invoice: InvoiceForRemission,
  ) {
    const saleItemIds = invoice.items
      .map((i) => i.saleOrderItemId)
      .filter((v): v is string => v !== null);
    const [remitted, sent, saleItems, serials] = await Promise.all([
      this.notes.remittedQuantities(tenantId, invoice.id, client),
      this.notes.remittedSerials(tenantId, invoice.id, client),
      this.sources.findSaleItemsForRemission(tenantId, saleItemIds, client),
      this.sources.findSerialsBySaleItems(tenantId, saleItemIds, client),
    ]);
    return remitableItems(
      invoice.items.map((i) => ({
        invoiceItemId: i.id,
        quantity: i.quantity,
        saleOrderItemId: i.saleOrderItemId,
      })),
      saleItems,
      remitted,
      serials,
      sent,
    );
  }

  private async company(tenantId: string, client?: Tx) {
    const tenant = await this.sources.findTenantForRemission(tenantId, client);
    return {
      name: tenant?.razonSocial ?? tenant?.name ?? '',
      ruc: tenant?.ruc ?? '',
      address: [tenant?.address, tenant?.numeroCasa, tenant?.city]
        .filter(Boolean)
        .join(', '),
    };
  }

  private async create(
    tx: Tx,
    params: {
      tenantId: string;
      userId?: string;
      now: Date;
      dto: IssueBase;
      dates: { start: Date; end: Date };
      branchId: string;
      motive: RemissionMotive;
      recipient: { customerId: string | null; name: string; document: string };
      invoiceId: string | null;
      fromWarehouseId: string | null;
      toWarehouseId: string | null;
      transitStatus: RemissionTransitStatus | null;
      lines: RemissionLine[];
    },
  ) {
    const { tenantId, dto, userId } = params;
    const numbering = await this.seriesService.numberForIssue(
      tenantId,
      {
        branchId: params.branchId,
        seriesId: dto.seriesId,
        documentNumber: dto.documentNumber,
        at: params.now,
        documentType: BillingDocumentType.REMISSION_NOTE,
      },
      tx,
    );
    const id = randomUUID();
    const t = dto.transport;
    const clean = (value: string | undefined) => value?.trim() || null;
    await this.notes.createWithItems(
      {
        id,
        tenantId,
        branchId: params.branchId,
        motive: params.motive,
        invoiceId: params.invoiceId,
        fromWarehouseId: params.fromWarehouseId,
        toWarehouseId: params.toWarehouseId,
        transitStatus: params.transitStatus,
        customerId: params.recipient.customerId,
        recipientName: params.recipient.name,
        recipientDocument: params.recipient.document,
        originAddress: dto.origin.address.trim(),
        originCity: dto.origin.city.trim(),
        originDepartment: dto.origin.department.trim(),
        destinationAddress: dto.destination.address.trim(),
        destinationCity: dto.destination.city.trim(),
        destinationDepartment: dto.destination.department.trim(),
        transportType: t.type,
        vehicleBrand: t.vehicleBrand.trim(),
        vehiclePlate: t.vehiclePlate.trim().toUpperCase(),
        trailerPlate: clean(t.trailerPlate)?.toUpperCase() ?? null,
        carrierName: t.carrierName.trim(),
        carrierRuc: t.carrierRuc.trim(),
        carrierAddress: t.carrierAddress.trim(),
        driverName: t.driverName.trim(),
        driverDocument: t.driverDocument.trim(),
        driverAddress: t.driverAddress.trim(),
        transportStartDate: params.dates.start,
        transportEndDate: params.dates.end,
        notes: clean(dto.notes),
        seriesId: numbering.seriesId,
        modality: numbering.modality,
        timbrado: numbering.timbrado,
        timbradoValidFrom: numbering.timbradoValidFrom,
        timbradoValidUntil: numbering.timbradoValidUntil,
        serieCode: numbering.serieCode,
        establecimiento: numbering.establecimiento,
        puntoExpedicion: numbering.puntoExpedicion,
        sequential: numbering.sequential,
        numberPrefix: numbering.invoicePrefix,
        number: numbering.invoiceNumber,
        issuedAt: params.now,
        issuedById: userId ?? null,
      },
      params.lines.map((line) => ({
        productId: line.productId,
        invoiceItemId: line.invoiceItemId,
        description: line.description,
        unit: line.unit,
        quantity: line.quantity,
        serialNumbers: line.serialNumbers,
      })),
      tx,
    );

    const number = `${numbering.invoicePrefix}${numbering.invoiceNumber}`;
    await this.events.record(
      {
        tenantId,
        remissionNoteId: id,
        invoiceId: params.invoiceId,
        type: BillingEventType.REMISSION_NOTE_ISSUED,
        userId,
        detail: { number, motive: params.motive },
      },
      tx,
    );
    const pdfEvent =
      numbering.modality === 'SELF_PRINTED'
        ? await this.outbox.enqueue(
            tx,
            tenantId,
            'remission-note.pdf.requested',
            { tenantId, remissionNoteId: id, requestedById: userId ?? null },
          )
        : null;
    return { id, number, pdfEvent, invoiceId: params.invoiceId };
  }

  private async afterIssue(
    tenantId: string,
    created: {
      id: string;
      number: string;
      pdfEvent: string | null;
      invoiceId: string | null;
    },
    userId?: string,
  ) {
    if (created.pdfEvent) await this.outbox.dispatch(created.pdfEvent);
    this.eventBus.emit('audit.log', {
      tenantId,
      userId,
      module: 'billing',
      action: 'remission-note.issued',
      resourceId: created.id,
      after: { number: created.number, invoiceId: created.invoiceId },
    } satisfies AuditLogEvent);
  }

  private async saveUnique<T>(save: () => Promise<T>): Promise<T> {
    try {
      return await save();
    } catch (error) {
      if (isDuplicate(error)) {
        throw new ConflictException(
          'Ese número de nota de remisión ya se usó. Recargá e intentá de nuevo.',
        );
      }
      throw error;
    }
  }
}
