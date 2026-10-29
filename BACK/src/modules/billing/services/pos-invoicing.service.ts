import {
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventBus } from '../../../common/events/event-bus';
import { BillingDocumentType, Prisma } from '@prisma/client';
import type {
  BillingGateway,
  FiscalReceipt,
  IssuePosInvoiceInput,
  PosSeriesSummary,
} from '../../../common/contracts/billing-gateway.contract';
import { OutboxService } from '../../../outbox/outbox.service';
import { BillingSeriesRepository } from '../repositories/billing-series.repository';
import { BillingSourcesRepository } from '../repositories/billing-sources.repository';
import { InvoicesRepository } from '../repositories/invoices.repository';
import { buildFiscalReceipt } from '../utils/fiscal-receipt.util';
import { toInvoiceItem } from '../utils/invoice-items.util';
import { BillingSeriesService, seriesProblem } from './billing-series.service';

@Injectable()
export class PosInvoicingService implements BillingGateway {
  private readonly logger = new Logger(PosInvoicingService.name);

  constructor(
    private readonly seriesRepository: BillingSeriesRepository,
    private readonly seriesService: BillingSeriesService,
    private readonly invoicesRepository: InvoicesRepository,
    private readonly billingSources: BillingSourcesRepository,
    private readonly outbox: OutboxService,
    private readonly eventEmitter: EventBus,
  ) {}

  async findSeries(
    tenantId: string,
    seriesId: string,
  ): Promise<PosSeriesSummary | null> {
    const series = await this.seriesRepository.findById(tenantId, seriesId);
    if (!series) return null;
    return {
      id: series.id,
      branchId: series.branchId,
      modality: series.modality,
      establecimiento: series.establecimiento,
      puntoExpedicion: series.puntoExpedicion,
      timbrado: series.timbrado,
      rangeFrom: series.rangeFrom,
      rangeTo: series.rangeTo,
      nextNumber: series.nextNumber,
      isInvoiceSeries: series.documentType === BillingDocumentType.INVOICE,
      problem: seriesProblem(series, new Date()),
    };
  }

  async issuePosInvoice(
    tx: Prisma.TransactionClient,
    tenantId: string,
    input: IssuePosInvoiceInput,
  ) {
    const order = await this.billingSources.findSaleOrderForInvoicing(
      tenantId,
      input.saleOrderId,
      tx,
    );
    if (!order) throw new NotFoundException('Venta no encontrada');

    const numbering = await this.seriesService.numberForIssue(
      tenantId,
      {
        branchId: input.branchId,
        seriesId: input.seriesId,
        documentNumber: input.documentNumber,
        at: input.at,
      },
      tx,
    );

    if (numbering.modality === 'PREPRINTED') {
      const problem = await this.seriesService.formFitProblem(
        tenantId,
        numbering.seriesId,
        order.items.length,
        tx,
      );
      if (problem) throw new UnprocessableEntityException(problem);
    }

    const items = order.items.map(toInvoiceItem);
    const total = items.reduce((sum, item) => sum + item.total, 0);
    const invoice = await this.invoicesRepository.createPaid(
      tenantId,
      {
        saleOrderId: input.saleOrderId,
        numbering,
        total,
        issuedAt: input.at,
        paymentMethod: input.paymentMethod,
        anonymousBuyer: input.anonymousBuyer,
        items,
      },
      tx,
    );

    const eventId = await this.outbox.enqueue(tx, tenantId, 'invoice.issued', {
      tenantId,
      invoiceId: invoice.id,
      saleOrderId: input.saleOrderId,
      paymentCondition: 'CASH',
      total,
      dueDate: null,
      issuedById: input.issuedById,
    });
    return { invoiceId: invoice.id, eventId };
  }

  requestPdf(tenantId: string, invoiceId: string): void {
    void this.generatePdf(tenantId, invoiceId);
  }

  async recordFormPrint(tenantId: string, invoiceId: string): Promise<void> {
    await this.invoicesRepository.recordFormPrint(
      tenantId,
      invoiceId,
      new Date(),
    );
  }

  async findReceiptBySaleOrder(
    tenantId: string,
    saleOrderId: string,
  ): Promise<FiscalReceipt | null> {
    const invoice = await this.invoicesRepository.findForReceipt(
      tenantId,
      saleOrderId,
    );
    return invoice ? buildFiscalReceipt(invoice) : null;
  }

  private async generatePdf(tenantId: string, invoiceId: string) {
    try {
      const invoice = await this.invoicesRepository.findById(
        tenantId,
        invoiceId,
      );
      // Con talonario la factura es la hoja impresa: no lleva PDF.
      if (
        !invoice?.issuedAt ||
        invoice.pdfFileId ||
        invoice.modality === 'PREPRINTED' ||
        invoice.status === 'CANCELLED'
      ) {
        return;
      }
      await this.eventEmitter.emitAsync('invoice.pdf.requested', {
        tenantId,
        invoiceId,
        saleOrderId: invoice.saleOrderId,
        paymentCondition: 'CASH',
        total: Number(invoice.total),
        dueDate: null,
        attemptAt: invoice.issuedAt,
        expectedStatus: invoice.status,
      });
    } catch (error) {
      // La factura ya está emitida y la caja la imprimió; el A4 se puede
      // regenerar desde el detalle de la factura.
      this.logger.warn(
        `No se pudo generar el PDF de la factura ${invoiceId}: ${(error as Error).message}`,
      );
    }
  }
}
