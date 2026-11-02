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
  CustomerCreditSource,
  Prisma,
} from '@prisma/client';
import type { AuditLogEvent } from '../../../audit/audit-log.event';
import {
  LOAN_CREDITS,
  type LoanCredits,
} from '../../../common/contracts/loan-credits.contract';
import {
  RECEIVABLES,
  type Receivables,
} from '../../../common/contracts/receivables.contract';
import {
  STOCK_LEDGER,
  type ReturnLine,
  type StockLedger,
} from '../../../common/contracts/stock-ledger.contract';
import { EventBus } from '../../../common/events/event-bus';
import { FilesService } from '../../../files/files.service';
import { OutboxService } from '../../../outbox/outbox.service';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  IssueCreditNoteDto,
  RestockLineDto,
  SettlementDto,
  VoidInvoiceDto,
} from '../dto/credit-note.dto';
import { BillingEventsRepository } from '../repositories/billing-events.repository';
import { CreditNotesRepository } from '../repositories/credit-notes.repository';
import { CreditSettlementsRepository } from '../repositories/credit-settlements.repository';
import { InvoicesRepository } from '../repositories/invoices.repository';
import {
  buildCreditLines,
  type CreditableItem,
  type CreditLine,
  creditableItems,
  splitAgainstBalance,
} from '../utils/credit-note.util';
import { buildCreditNoteReceipt } from '../utils/fiscal-receipt.util';
import { BillingSeriesService } from './billing-series.service';
import { CreditNotePdfService } from './credit-note-pdf.service';

type Tx = Prisma.TransactionClient;
type InvoiceForCredit = NonNullable<
  Awaited<ReturnType<InvoicesRepository['findForCredit']>>
>;

const round2 = (n: number) => Math.round(n * 100) / 100;
const money = (n: number) =>
  n.toLocaleString('es-PY', { maximumFractionDigits: 0 });

const isDuplicate = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === 'P2002';

/** Cliente identificado de la factura; null en "Sin Nombre". */
export function customerOf(invoice: InvoiceForCredit) {
  if (invoice.anonymousBuyer) return null;
  return (
    invoice.saleOrder?.customer ?? invoice.paymentReceipt?.customer ?? null
  );
}

export function branchOf(invoice: InvoiceForCredit): string | null {
  return (
    invoice.series?.branchId ??
    invoice.saleOrder?.branchId ??
    invoice.paymentReceipt?.branchId ??
    null
  );
}

export function assertCreditable(invoice: InvoiceForCredit) {
  if (invoice.status === 'PENDING') {
    throw new UnprocessableEntityException(
      'La factura todavía no se emitió: un borrador no se acredita',
    );
  }
  if (invoice.status === 'CANCELLED') {
    throw new UnprocessableEntityException(
      'La factura está anulada: no se puede acreditar',
    );
  }
}

/**
 * Notas de crédito fiscales (art. 11 del Decreto 6539/05): anulan la
 * operación, aceptan devoluciones o conceden descuentos sobre una factura ya
 * emitida. Se numeran con su propia serie y timbrado.
 */
@Injectable()
export class CreditNotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invoicesRepository: InvoicesRepository,
    private readonly creditNotes: CreditNotesRepository,
    private readonly settlements: CreditSettlementsRepository,
    private readonly events: BillingEventsRepository,
    private readonly seriesService: BillingSeriesService,
    private readonly pdf: CreditNotePdfService,
    private readonly filesService: FilesService,
    private readonly outbox: OutboxService,
    private readonly eventBus: EventBus,
    @Inject(RECEIVABLES) private readonly receivables: Receivables,
    @Inject(LOAN_CREDITS) private readonly loanCredits: LoanCredits,
    @Inject(STOCK_LEDGER) private readonly stockLedger: StockLedger,
  ) {}

  findAll(tenantId: string) {
    return this.creditNotes.findAll(tenantId);
  }

  findByInvoice(tenantId: string, invoiceId: string) {
    return this.creditNotes.findByInvoice(tenantId, invoiceId);
  }

  async findOne(tenantId: string, id: string) {
    const note = await this.creditNotes.findById(tenantId, id);
    if (!note) throw new NotFoundException('Nota de crédito no encontrada');
    const events = await this.events.findByCreditNote(tenantId, id);
    return { ...note, events };
  }

  /** Lo que se puede acreditar de una factura y con qué serie. */
  async options(tenantId: string, invoiceId: string) {
    const invoice = await this.invoicesRepository.findForCredit(
      tenantId,
      invoiceId,
    );
    if (!invoice) throw new NotFoundException('Factura no encontrada');
    assertCreditable(invoice);

    const total = Number(invoice.total);
    const remaining = round2(total - Number(invoice.creditedTotal));
    const { items, returnable, balance } = await this.prisma.$transaction(
      async (tx) => {
        const credited = await this.creditNotes.creditedQuantities(
          tenantId,
          invoiceId,
          tx,
        );
        const creditable = creditableItems(total, invoice.items, credited);
        const saleItemIds = creditable
          .map((i) => i.saleOrderItemId)
          .filter((id): id is string => id !== null);
        return {
          items: creditable,
          returnable: await this.stockLedger.findReturnable(
            tx,
            tenantId,
            saleItemIds,
          ),
          balance: await this.balanceOf(tx, tenantId, invoice, remaining),
        };
      },
    );
    const customer = customerOf(invoice);
    const series = await this.seriesService.findIssueOptions(
      tenantId,
      branchOf(invoice),
      new Date(),
      BillingDocumentType.CREDIT_NOTE,
    );

    return {
      invoice: {
        id: invoice.id,
        number: `${invoice.invoicePrefix ?? ''}${invoice.invoiceNumber ?? ''}`,
        status: invoice.status,
        total,
        creditedTotal: Number(invoice.creditedTotal),
        remaining,
        isCreditSale: invoice.saleOrder?.saleType === 'CREDIT',
      },
      customer: customer
        ? {
            id: customer.id,
            name: `${customer.firstName} ${customer.lastName}`.trim(),
            creditBalance: await this.settlements.customerBalance(
              tenantId,
              customer.id,
            ),
          }
        : null,
      balance,
      items: items.map((item) => {
        const stock = item.saleOrderItemId
          ? returnable.get(item.saleOrderItemId)
          : undefined;
        return {
          ...item,
          restockable: Boolean(stock?.stocked),
          isSerialized: Boolean(stock?.isSerialized),
          soldSerials: stock?.soldSerials ?? [],
        };
      }),
      series,
    };
  }

  async issue(
    tenantId: string,
    invoiceId: string,
    dto: IssueCreditNoteDto,
    userId?: string,
  ) {
    const now = new Date();
    let created: { id: string; pdfEvent: string | null; number: string };
    try {
      created = await this.prisma.$transaction(async (tx) => {
        const invoice = await this.invoicesRepository.findForCredit(
          tenantId,
          invoiceId,
          tx,
        );
        if (!invoice) throw new NotFoundException('Factura no encontrada');
        assertCreditable(invoice);

        const total = Number(invoice.total);
        const remaining = round2(total - Number(invoice.creditedTotal));
        const credited = await this.creditNotes.creditedQuantities(
          tenantId,
          invoiceId,
          tx,
        );
        const available = creditableItems(total, invoice.items, credited);
        const { lines, total: noteTotal } = buildCreditLines(
          {
            kind: dto.kind,
            reason: dto.reason,
            items: dto.items,
            amount: dto.amount,
            ivaRate: dto.ivaRate,
          },
          available,
          remaining,
        );
        const restock = this.restockLines(dto, lines, available);

        const balance = await this.balanceOf(tx, tenantId, invoice, remaining);
        const { applied, excess } = splitAgainstBalance(
          noteTotal,
          balance.outstanding,
        );
        const customer = customerOf(invoice);
        this.assertSettlement(excess, dto.excess, customer?.id ?? null);

        const numbering = await this.seriesService.numberForIssue(
          tenantId,
          {
            branchId: branchOf(invoice),
            seriesId: dto.seriesId,
            documentNumber: dto.documentNumber,
            at: now,
            documentType: BillingDocumentType.CREDIT_NOTE,
          },
          tx,
        );
        if (numbering.modality === 'PREPRINTED') {
          const problem = await this.seriesService.formFitProblem(
            tenantId,
            numbering.seriesId,
            lines.length,
            tx,
            'creditNote',
          );
          if (problem) throw new UnprocessableEntityException(problem);
        }

        const updated = await this.invoicesRepository.addCredited(
          tenantId,
          invoiceId,
          invoice.creditedTotal,
          noteTotal,
          tx,
        );
        if (updated.count !== 1) {
          throw new ConflictException(
            'La factura cambió mientras se emitía la nota de crédito. Recargá e intentá de nuevo.',
          );
        }

        const restockByItem = new Map(restock.map((r) => [r.invoiceItemId, r]));
        const note = await this.creditNotes.createWithItems(
          {
            tenantId,
            invoiceId,
            reason: dto.reason.trim(),
            total: noteTotal,
            kind: dto.kind,
            issuedAt: now,
            seriesId: numbering.seriesId,
            modality: numbering.modality,
            timbrado: numbering.timbrado,
            timbradoValidFrom: numbering.timbradoValidFrom,
            timbradoValidUntil: numbering.timbradoValidUntil,
            serieCode: numbering.serieCode,
            establecimiento: numbering.establecimiento,
            puntoExpedicion: numbering.puntoExpedicion,
            sequential: numbering.sequential,
            number: numbering.invoiceNumber,
            numberPrefix: numbering.invoicePrefix,
            customerId: customer?.id ?? null,
            issuedById: userId ?? null,
            appliedToBalance: applied,
          },
          lines.map((line) => {
            const back = line.invoiceItemId
              ? restockByItem.get(line.invoiceItemId)
              : undefined;
            return {
              invoiceItemId: line.invoiceItemId,
              description: line.description,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              total: line.total,
              ivaRate: line.ivaRate,
              ivaAmount: line.ivaAmount,
              restockQuantity: back?.quantity ?? 0,
              serialNumbers: back?.serialNumbers ?? [],
            };
          }),
          tx,
        );

        if (applied > 0) {
          await this.receivables.applyCredit(tx, tenantId, invoiceId, applied);
          if (invoice.saleOrder?.saleType === 'CREDIT' && invoice.saleOrderId) {
            await this.loanCredits.applyCredit(
              tx,
              tenantId,
              invoice.saleOrderId,
              applied,
            );
          }
        }
        if (excess > 0 && dto.excess) {
          await this.settle(tx, {
            tenantId,
            customerId: customer?.id ?? null,
            invoiceId,
            creditNoteId: note.id,
            amount: excess,
            settlement: dto.excess,
            source: CustomerCreditSource.CREDIT_NOTE,
            userId,
          });
        }
        if (restock.length > 0) {
          await this.stockLedger.restockReturn(
            tx,
            tenantId,
            note.id,
            restock.map((r): ReturnLine => ({
              saleItemId: r.saleItemId,
              quantity: r.quantity,
              serialNumbers: r.serialNumbers,
            })),
          );
        }

        const number = `${numbering.invoicePrefix}${numbering.invoiceNumber}`;
        await this.events.record(
          {
            tenantId,
            invoiceId,
            creditNoteId: note.id,
            type: BillingEventType.CREDIT_NOTE_ISSUED,
            userId,
            detail: { number, total: noteTotal, kind: dto.kind },
          },
          tx,
        );

        const pdfEvent =
          numbering.modality === 'SELF_PRINTED'
            ? await this.outbox.enqueue(
                tx,
                tenantId,
                'credit-note.pdf.requested',
                {
                  tenantId,
                  creditNoteId: note.id,
                  requestedById: userId ?? null,
                },
              )
            : null;
        return { id: note.id, pdfEvent, number };
      });
    } catch (error) {
      if (isDuplicate(error)) {
        throw new ConflictException(
          'Ese número de nota de crédito ya se usó. Recargá e intentá de nuevo.',
        );
      }
      throw error;
    }

    if (created.pdfEvent) await this.outbox.dispatch(created.pdfEvent);
    this.eventBus.emit('audit.log', {
      tenantId,
      userId,
      module: 'billing',
      action: 'credit-note.issued',
      resourceId: created.id,
      after: { invoiceId, number: created.number },
    } satisfies AuditLogEvent);

    return this.findOne(tenantId, created.id);
  }

  /**
   * Anula una factura emitida que la empresa conserva entera (original y
   * copias): queda sin efecto sin nota de crédito. Solo si no se cobró nada,
   * salvo una venta de caja ya cobrada, cuya plata se devuelve o queda como
   * saldo a favor.
   */
  async voidInvoice(
    tenantId: string,
    invoiceId: string,
    dto: VoidInvoiceDto,
    userId?: string,
  ) {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const invoice = await this.invoicesRepository.findForCredit(
        tenantId,
        invoiceId,
        tx,
      );
      if (!invoice) throw new NotFoundException('Factura no encontrada');
      if (invoice.status === 'CANCELLED') {
        throw new UnprocessableEntityException('La factura ya está anulada');
      }
      if (invoice.status === 'PENDING') {
        throw new UnprocessableEntityException(
          'Un borrador no se anula: se descarta',
        );
      }
      if (invoice.invoiceType === 'INTEREST') {
        throw new UnprocessableEntityException(
          'Una factura de intereses se corrige con una nota de crédito',
        );
      }
      if (Number(invoice.creditedTotal) > 0) {
        throw new UnprocessableEntityException(
          'La factura ya tiene notas de crédito: acreditá lo que queda en vez de anularla',
        );
      }

      const total = Number(invoice.total);
      let paid = 0;
      if (invoice.status === 'PAID') {
        paid = total;
      } else if (await this.hasCollected(tx, tenantId, invoice)) {
        throw new UnprocessableEntityException(
          'La factura ya tiene cobros: emití una nota de crédito por el total en vez de anularla',
        );
      }
      const customer = customerOf(invoice);
      this.assertSettlement(paid, dto.settlement, customer?.id ?? null);

      const voided = await this.invoicesRepository.voidIfAllowed(
        tenantId,
        invoiceId,
        invoice.status,
        invoice.updatedAt,
        dto.reason.trim(),
        now,
        tx,
      );
      if (voided.count !== 1) {
        throw new ConflictException(
          'La factura cambió mientras se anulaba. Recargá e intentá de nuevo.',
        );
      }
      if (invoice.saleOrder?.saleType === 'CREDIT' && invoice.saleOrderId) {
        await this.loanCredits.cancel(tx, tenantId, invoice.saleOrderId);
      }
      if (paid > 0 && dto.settlement) {
        await this.settle(tx, {
          tenantId,
          customerId: customer?.id ?? null,
          invoiceId,
          creditNoteId: null,
          amount: paid,
          settlement: dto.settlement,
          source: CustomerCreditSource.INVOICE_VOID,
          userId,
        });
      }
      await this.events.record(
        {
          tenantId,
          invoiceId,
          type: BillingEventType.VOIDED,
          userId,
          detail: { reason: dto.reason.trim() },
        },
        tx,
      );
    });

    // Inventario devuelve el stock y Pagos cancela la cuenta por cobrar.
    this.eventBus.emit('invoice.cancelled', { tenantId, invoiceId });
    this.eventBus.emit('audit.log', {
      tenantId,
      userId,
      module: 'billing',
      action: 'invoice.voided',
      resourceId: invoiceId,
      after: { reason: dto.reason.trim() },
    } satisfies AuditLogEvent);
  }

  /** Datos para imprimir sobre la hoja; cada llamada cuenta como impresión. */
  async print(tenantId: string, id: string, userId?: string) {
    const note = await this.creditNotes.findForReceipt(tenantId, id);
    if (!note) throw new NotFoundException('Nota de crédito no encontrada');
    if (note.modality !== 'PREPRINTED') {
      throw new UnprocessableEntityException(
        'Solo una nota de crédito de talonario se imprime sobre la hoja',
      );
    }
    const at = new Date();
    await this.prisma.$transaction(async (tx) => {
      await this.creditNotes.recordFormPrint(tenantId, id, at, tx);
      await this.events.record(
        {
          tenantId,
          creditNoteId: id,
          type: BillingEventType.FORM_PRINTED,
          userId,
        },
        tx,
      );
    });
    const current = await this.creditNotes.findById(tenantId, id);
    return {
      receipt: buildCreditNoteReceipt(note),
      printCount: current?.formPrintCount ?? 0,
      printedAt: current?.formPrintedAt ?? at,
    };
  }

  async setPhysicalScan(
    tenantId: string,
    id: string,
    fileId: string | null,
    userId?: string,
  ) {
    const note = await this.creditNotes.findById(tenantId, id);
    if (!note) throw new NotFoundException('Nota de crédito no encontrada');
    if (fileId) await this.filesService.getById(tenantId, fileId);
    await this.prisma.$transaction(async (tx) => {
      await this.creditNotes.setPhysicalScan(tenantId, id, fileId, tx);
      await this.events.record(
        {
          tenantId,
          creditNoteId: id,
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
    const note = await this.creditNotes.findById(tenantId, id);
    if (!note) throw new NotFoundException('Nota de crédito no encontrada');
    if (note.modality !== 'SELF_PRINTED') {
      throw new UnprocessableEntityException(
        'La nota de crédito de talonario es la hoja impresa: no tiene PDF',
      );
    }
    await this.pdf.generate(tenantId, id, userId ?? null);
    return this.findOne(tenantId, id);
  }

  async customerCredit(tenantId: string, customerId: string) {
    const [balance, entries] = await Promise.all([
      this.settlements.customerBalance(tenantId, customerId),
      this.settlements.customerEntries(tenantId, customerId),
    ]);
    return { balance, entries };
  }

  /**
   * Lo que el cliente todavía debe de la factura y lo que ya pagó. Una
   * factura que nació pagada (caja, intereses) no debe nada.
   */
  async balanceOf(
    tx: Tx,
    tenantId: string,
    invoice: InvoiceForCredit,
    remaining: number,
  ): Promise<{ outstanding: number; paid: number }> {
    if (invoice.status === 'PAID') return { outstanding: 0, paid: remaining };
    const ar = await this.receivables.balance(tx, tenantId, invoice.id);
    if (ar) return { outstanding: ar.outstanding, paid: ar.paid };
    return { outstanding: remaining, paid: 0 };
  }

  private async hasCollected(
    tx: Tx,
    tenantId: string,
    invoice: InvoiceForCredit,
  ): Promise<boolean> {
    if (Number(invoice.saleOrder?.downPayment?.amount ?? 0) > 0) return true;
    const ar = await this.receivables.balance(tx, tenantId, invoice.id);
    if (ar && ar.paid > 0) return true;
    if (invoice.saleOrder?.saleType === 'CREDIT' && invoice.saleOrderId) {
      return this.loanCredits.hasCollected(tx, tenantId, invoice.saleOrderId);
    }
    return false;
  }

  assertSettlement(
    excess: number,
    settlement: SettlementDto | undefined,
    customerId: string | null,
  ) {
    if (excess <= 0) return;
    if (!settlement) {
      throw new UnprocessableEntityException(
        `El cliente ya pagó Gs. ${money(excess)} de lo que se acredita: elegí si queda como saldo a favor o se le devuelve.`,
      );
    }
    if (settlement.mode === 'CUSTOMER_CREDIT' && !customerId) {
      throw new UnprocessableEntityException(
        'La factura no tiene un cliente identificado: el excedente solo se puede devolver.',
      );
    }
  }

  async settle(
    tx: Tx,
    params: {
      tenantId: string;
      customerId: string | null;
      invoiceId: string;
      creditNoteId: string | null;
      amount: number;
      settlement: SettlementDto;
      source: CustomerCreditSource;
      userId?: string;
    },
  ) {
    const { tenantId, settlement, amount } = params;
    if (settlement.mode === 'CUSTOMER_CREDIT' && params.customerId) {
      await this.settlements.addCustomerCredit(
        {
          tenantId,
          customerId: params.customerId,
          amount,
          source: params.source,
          creditNoteId: params.creditNoteId,
          invoiceId: params.invoiceId,
          createdById: params.userId ?? null,
        },
        tx,
      );
      await this.events.record(
        {
          tenantId,
          invoiceId: params.invoiceId,
          creditNoteId: params.creditNoteId,
          type: BillingEventType.CUSTOMER_CREDITED,
          userId: params.userId,
          detail: { amount },
        },
        tx,
      );
      return;
    }
    if (!settlement.method) {
      throw new UnprocessableEntityException(
        'Elegí cómo se le devuelve el dinero al cliente',
      );
    }
    await this.settlements.createRefund(
      {
        tenantId,
        creditNoteId: params.creditNoteId,
        invoiceId: params.invoiceId,
        amount,
        method: settlement.method,
        reference: settlement.reference?.trim() || null,
        createdById: params.userId ?? null,
      },
      tx,
    );
    await this.events.record(
      {
        tenantId,
        invoiceId: params.invoiceId,
        creditNoteId: params.creditNoteId,
        type: BillingEventType.REFUNDED,
        userId: params.userId,
        detail: { amount, method: settlement.method },
      },
      tx,
    );
  }

  /** Lo que vuelve al stock: solo de lo que se acredita, ítem por ítem. */
  private restockLines(
    dto: IssueCreditNoteDto,
    lines: CreditLine[],
    available: CreditableItem[],
  ) {
    const requested: RestockLineDto[] = dto.restock ?? [];
    if (requested.length === 0) return [];
    if (dto.kind === 'AMOUNT') {
      throw new UnprocessableEntityException(
        'Un descuento por importe no devuelve mercadería',
      );
    }
    const seen = new Set<string>();
    return requested.map((req) => {
      const line = lines.find((l) => l.invoiceItemId === req.invoiceItemId);
      const item = available.find((i) => i.invoiceItemId === req.invoiceItemId);
      if (!line || !item) {
        throw new UnprocessableEntityException(
          'Solo vuelve al stock lo que se acredita en esta nota',
        );
      }
      if (seen.has(req.invoiceItemId)) {
        throw new UnprocessableEntityException(
          `"${item.description}" está repetido en lo que vuelve al stock`,
        );
      }
      seen.add(req.invoiceItemId);
      if (req.quantity > line.quantity) {
        throw new UnprocessableEntityException(
          `De "${item.description}" vuelven al stock hasta ${line.quantity} unidades`,
        );
      }
      if (!item.saleOrderItemId) {
        throw new UnprocessableEntityException(
          `"${item.description}" no se puede reingresar: no está vinculado al pedido de venta`,
        );
      }
      return {
        invoiceItemId: req.invoiceItemId,
        saleItemId: item.saleOrderItemId,
        quantity: req.quantity,
        serialNumbers: req.serialNumbers ?? [],
      };
    });
  }
}
