import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import type { AuditLogEvent } from '../../../audit/audit-log.event';
import { FilesService } from '../../../files/files.service';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  VoidInvoiceSheetDto,
  VoidLooseSheetDto,
} from '../dto/preprinted-sheet.dto';
import { InvoicesRepository } from '../repositories/invoices.repository';
import { buildFiscalReceipt } from '../utils/fiscal-receipt.util';
import { BillingSeriesService } from './billing-series.service';

const isDuplicate = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === 'P2002';

/**
 * Facturas de talonario de imprenta: el comprobante es la hoja preimpresa.
 * El sistema imprime los datos sobre la hoja, registra cada impresión y
 * lleva el control de las hojas inutilizadas.
 */
@Injectable()
export class PreprintedInvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invoicesRepository: InvoicesRepository,
    private readonly seriesService: BillingSeriesService,
    private readonly filesService: FilesService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /** Datos para imprimir sobre la hoja; cada llamada cuenta como impresión. */
  async print(tenantId: string, id: string, userId?: string) {
    const invoice = await this.findPrintable(tenantId, id);
    const printedAt = new Date();
    await this.invoicesRepository.recordFormPrint(tenantId, id, printedAt);
    this.audit(tenantId, userId, 'invoice.form.printed', id, {
      sheet: invoice.sequential,
      printNumber: invoice.formPrintCount + 1,
    });
    return {
      receipt: buildFiscalReceipt(invoice),
      printCount: invoice.formPrintCount + 1,
      printedAt,
    };
  }

  /**
   * La hoja se arruinó: su número queda inutilizado y la factura pasa a otra
   * hoja del talonario (la indicada o la siguiente sugerida).
   */
  async voidSheet(
    tenantId: string,
    id: string,
    dto: VoidInvoiceSheetDto,
    userId?: string,
  ) {
    const invoice = await this.findPrintable(tenantId, id);
    if (dto.scanFileId) await this.assertFile(tenantId, dto.scanFileId);
    const fromSequential = invoice.sequential!;

    try {
      await this.prisma.$transaction(async (tx) => {
        const numbering = await this.seriesService.numberForPreprintedSheet(
          tenantId,
          {
            seriesId: invoice.seriesId!,
            documentNumber: dto.documentNumber,
            at: invoice.issuedAt ?? new Date(),
          },
          tx,
        );
        const moved = await this.invoicesRepository.moveToSheet(
          tenantId,
          id,
          fromSequential,
          numbering,
          tx,
        );
        if (moved.count !== 1) {
          throw new UnprocessableEntityException(
            'La factura cambió mientras tanto. Recargá la página.',
          );
        }
        await this.seriesService.recordVoidedSheet(
          tenantId,
          {
            seriesId: invoice.seriesId!,
            sequential: fromSequential,
            invoiceId: id,
            reason: dto.reason,
            scanFileId: dto.scanFileId,
            userId,
          },
          tx,
        );
      });
    } catch (error) {
      if (isDuplicate(error)) {
        throw new UnprocessableEntityException(
          'Esa hoja ya fue usada o inutilizada. Elegí otro número.',
        );
      }
      throw error;
    }

    this.audit(tenantId, userId, 'invoice.sheet.voided', id, {
      voidedSheet: fromSequential,
      reason: dto.reason,
    });
    return this.invoicesRepository.findById(tenantId, id);
  }

  async setPhysicalScan(
    tenantId: string,
    id: string,
    fileId: string | null,
    userId?: string,
  ) {
    await this.findPrintable(tenantId, id);
    if (fileId) await this.assertFile(tenantId, fileId);
    await this.invoicesRepository.setPhysicalScan(tenantId, id, fileId);
    this.audit(
      tenantId,
      userId,
      fileId ? 'invoice.scan.attached' : 'invoice.scan.removed',
      id,
    );
    return this.invoicesRepository.findById(tenantId, id);
  }

  async voidLooseSheet(
    tenantId: string,
    seriesId: string,
    dto: VoidLooseSheetDto,
    userId?: string,
  ) {
    if (dto.scanFileId) await this.assertFile(tenantId, dto.scanFileId);
    try {
      await this.prisma.$transaction((tx) =>
        this.seriesService.voidLooseSheet(
          tenantId,
          seriesId,
          { ...dto, userId },
          tx,
        ),
      );
    } catch (error) {
      if (isDuplicate(error)) {
        throw new UnprocessableEntityException(
          `El número ${dto.documentNumber} del talonario ya fue usado o inutilizado`,
        );
      }
      throw error;
    }
    this.audit(tenantId, userId, 'billing.sheet.voided', seriesId, {
      sheet: dto.documentNumber,
      reason: dto.reason,
    });
    return this.seriesService.findVoided(tenantId, seriesId);
  }

  private async findPrintable(tenantId: string, id: string) {
    const invoice = await this.invoicesRepository.findForForm(tenantId, id);
    if (!invoice) throw new NotFoundException('Factura no encontrada');
    if (invoice.modality !== 'PREPRINTED' || invoice.sequential == null) {
      throw new UnprocessableEntityException(
        'Solo las facturas numeradas de un talonario de imprenta se imprimen sobre la hoja',
      );
    }
    if (invoice.status !== 'ISSUED' && invoice.status !== 'PAID') {
      throw new UnprocessableEntityException(
        invoice.status === 'CANCELLED'
          ? 'La factura está cancelada'
          : 'La factura todavía no fue emitida',
      );
    }
    return invoice;
  }

  private assertFile(tenantId: string, fileId: string) {
    return this.filesService.getById(tenantId, fileId).catch(() => {
      throw new UnprocessableEntityException('El archivo adjunto no existe');
    });
  }

  private audit(
    tenantId: string,
    userId: string | undefined,
    action: string,
    resourceId: string,
    after?: Record<string, unknown>,
  ) {
    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'billing',
      action,
      resourceId,
      ...(after ? { after } : {}),
    } satisfies AuditLogEvent);
  }
}
