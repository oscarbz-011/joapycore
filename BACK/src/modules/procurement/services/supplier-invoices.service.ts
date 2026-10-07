import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { AuditLogEvent } from '../../../audit/audit-log.event';
import { FilesService } from '../../../files/files.service';
import { PrismaService } from '../../../prisma/prisma.service';
import type { PrismaClientOrTx } from '../../../prisma/types';
import { CreateSupplierInvoiceDto } from '../dto/create-supplier-invoice.dto';
import { SupplierInvoicesRepository } from '../repositories/supplier-invoices.repository';
import {
  compareInvoice,
  invoiceDueDate,
  payableAfterInvoice,
  requiresApproval,
} from '../supplier-invoice.util';

const INVOICE_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const gs = (n: number) => `Gs. ${Math.round(n).toLocaleString('es-PY')}`;

/**
 * Factura del proveedor. La cuenta por pagar nace estimada al recibir; la
 * factura la vuelve definitiva. Si coincide con lo recibido se aplica sola;
 * si no, queda esperando que alguien apruebe la diferencia y mientras tanto
 * la deuda no cambia.
 */
@Injectable()
export class SupplierInvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invoices: SupplierInvoicesRepository,
    private readonly eventEmitter: EventEmitter2,
    private readonly filesService: FilesService,
  ) {}

  // El archivo tiene que ser del tenant y ser una factura legible: PDF o foto.
  private async assertInvoiceFile(tenantId: string, fileId: string) {
    const file = await this.filesService.getById(tenantId, fileId);
    if (!INVOICE_FILE_TYPES.includes(file.mimeType)) {
      throw new UnprocessableEntityException(
        'La factura se adjunta en PDF o como imagen (JPG o PNG)',
      );
    }
  }

  /** Adjunta (o reemplaza) el archivo de una factura ya cargada. */
  async attachFile(
    tenantId: string,
    id: string,
    fileId: string,
    userId?: string,
  ) {
    await this.findOne(tenantId, id);
    await this.assertInvoiceFile(tenantId, fileId);
    await this.invoices.setFile(tenantId, id, fileId);
    this.audit(tenantId, userId, id, 'supplier.invoice.file.attached', {
      fileId,
    });
    return this.findOne(tenantId, id);
  }

  /** Recepciones del proveedor que todavía no tienen factura. */
  invoiceable(tenantId: string, supplierId: string) {
    return this.invoices.findInvoiceablePayables(tenantId, supplierId);
  }

  async findOne(tenantId: string, id: string) {
    const invoice = await this.invoices.findById(tenantId, id);
    if (!invoice) throw new NotFoundException('Factura no encontrada');
    return invoice;
  }

  async create(
    tenantId: string,
    dto: CreateSupplierInvoiceDto,
    userId?: string,
  ) {
    const payableIds = [...new Set(dto.payableIds)];
    const invoiceNumber = dto.invoiceNumber.trim();
    const shipping = dto.shippingAmount ?? 0;
    const discount = dto.discountAmount ?? 0;

    const payables = await this.invoices.findInvoiceablePayables(
      tenantId,
      dto.supplierId,
      payableIds,
    );
    if (payables.length !== payableIds.length) {
      throw new UnprocessableEntityException(
        'Alguna de las recepciones elegidas no es de este proveedor o ya tiene una factura cargada',
      );
    }

    const received = payables.flatMap((payable) =>
      payable.purchaseReceipt.items.map((item) => ({
        receiptItemId: item.id,
        payableId: payable.id,
        quantity: item.quantity,
        unitCost: Number(item.unitCost),
      })),
    );
    const receivedById = new Map(received.map((r) => [r.receiptItemId, r]));
    const lineIds = dto.lines.map((line) => line.purchaseReceiptItemId);
    if (new Set(lineIds).size !== lineIds.length) {
      throw new UnprocessableEntityException(
        'La factura repite una línea de la recepción',
      );
    }
    if (lineIds.some((id) => !receivedById.has(id))) {
      throw new UnprocessableEntityException(
        'La factura tiene una línea que no pertenece a las recepciones elegidas',
      );
    }

    const comparison = compareInvoice({
      received,
      invoiced: dto.lines.map((line) => ({
        receiptItemId: line.purchaseReceiptItemId,
        quantity: line.quantity,
        unitCost: line.unitCost,
      })),
      shipping,
      discount,
    });
    if (comparison.total < 0) {
      throw new UnprocessableEntityException(
        'El descuento no puede superar lo facturado',
      );
    }
    // Control: el total que se leyó de la factura tiene que salir de sus
    // líneas. Si no cierra, hay un dato mal cargado (o falta el flete).
    if (Math.abs(dto.total - comparison.total) > 0.01) {
      throw new UnprocessableEntityException(
        `El total de la factura (${gs(dto.total)}) no coincide con sus líneas, flete y descuento (${gs(comparison.total)}). Revisá las cantidades y los precios.`,
      );
    }
    if (dto.fileId) await this.assertInvoiceFile(tenantId, dto.fileId);

    if (
      await this.invoices.findActiveByNumber(
        tenantId,
        dto.supplierId,
        invoiceNumber,
      )
    ) {
      throw new ConflictException(
        `Ya hay una factura ${invoiceNumber} cargada para este proveedor`,
      );
    }

    const needsApproval = requiresApproval(comparison);
    const invoicedById = new Map(
      dto.lines.map((line) => [line.purchaseReceiptItemId, line]),
    );

    const invoiceId = await this.prisma.$transaction(async (tx) => {
      const created = await this.invoices.create(
        {
          tenantId,
          supplierId: dto.supplierId,
          invoiceNumber,
          timbrado: dto.timbrado?.trim() || null,
          invoiceDate: new Date(dto.invoiceDate),
          subtotal: comparison.subtotal,
          shippingAmount: shipping,
          discountAmount: discount,
          total: comparison.total,
          estimatedTotal: comparison.estimated,
          status: needsApproval ? 'PENDING_APPROVAL' : 'MATCHED',
          notes: dto.notes?.trim() || null,
          fileId: dto.fileId ?? null,
          createdById: userId,
          // Se guarda también lo recibido: la comparación tiene que poder
          // rehacerse tal como se vio al cargar la factura.
          items: {
            create: received.map((line) => {
              const invoiced = invoicedById.get(line.receiptItemId);
              return {
                purchaseReceiptItemId: line.receiptItemId,
                accountsPayableId: line.payableId,
                quantity: invoiced?.quantity ?? 0,
                unitCost: invoiced?.unitCost ?? line.unitCost,
                receivedQuantity: line.quantity,
                receivedUnitCost: line.unitCost,
              };
            }),
          },
        },
        tx,
      );

      const linked = await this.invoices.linkPayables(
        tenantId,
        created.id,
        payableIds,
        tx,
      );
      if (linked !== payableIds.length) {
        throw new ConflictException(
          'Otra persona cargó una factura para alguna de estas recepciones. Actualizá y volvé a intentar.',
        );
      }

      if (!needsApproval) await this.apply(tenantId, created.id, tx);
      return created.id;
    });

    this.audit(tenantId, userId, invoiceId, 'supplier.invoice.registered', {
      invoiceNumber,
      total: comparison.total,
      difference: comparison.difference,
      needsApproval,
    });
    return this.findOne(tenantId, invoiceId);
  }

  /** Acepta la diferencia: la deuda pasa a ser la de la factura. */
  async approve(tenantId: string, id: string, note?: string, userId?: string) {
    await this.findOne(tenantId, id);
    await this.prisma.$transaction(async (tx) => {
      await this.resolve(tenantId, id, 'APPROVED', note, userId, tx);
      await this.apply(tenantId, id, tx);
    });
    this.audit(tenantId, userId, id, 'supplier.invoice.approved', { note });
    return this.findOne(tenantId, id);
  }

  /**
   * No se acepta la factura (se reclama al proveedor). Las recepciones
   * quedan libres para cargar la factura corregida y la deuda sigue estimada.
   */
  async reject(tenantId: string, id: string, reason: string, userId?: string) {
    await this.findOne(tenantId, id);
    await this.prisma.$transaction(async (tx) => {
      await this.resolve(tenantId, id, 'REJECTED', reason, userId, tx);
      await this.invoices.unlinkPayables(tenantId, id, tx);
    });
    this.audit(tenantId, userId, id, 'supplier.invoice.rejected', { reason });
    return this.findOne(tenantId, id);
  }

  private async resolve(
    tenantId: string,
    id: string,
    status: 'APPROVED' | 'REJECTED',
    note: string | undefined,
    userId: string | undefined,
    tx: PrismaClientOrTx,
  ) {
    const changed = await this.invoices.transition(
      tenantId,
      id,
      'PENDING_APPROVAL',
      {
        status,
        reviewNote: note?.trim() || null,
        reviewedById: userId ?? null,
        reviewedAt: new Date(),
      },
      tx,
    );
    if (changed === 0) {
      throw new ConflictException(
        'Esta factura ya no está esperando aprobación',
      );
    }
  }

  // Pasa cada cuenta por pagar de la factura a su monto facturado.
  private async apply(tenantId: string, id: string, tx: PrismaClientOrTx) {
    const invoice = await this.invoices.findById(tenantId, id, tx);
    if (!invoice) throw new NotFoundException('Factura no encontrada');

    const comparison = compareInvoice({
      received: invoice.items.map((item) => ({
        receiptItemId: item.purchaseReceiptItemId,
        payableId: item.accountsPayableId,
        quantity: item.receivedQuantity,
        unitCost: Number(item.receivedUnitCost),
      })),
      invoiced: invoice.items.map((item) => ({
        receiptItemId: item.purchaseReceiptItemId,
        quantity: item.quantity,
        unitCost: Number(item.unitCost),
      })),
      shipping: Number(invoice.shippingAmount),
      discount: Number(invoice.discountAmount),
    });
    const amounts = new Map(
      comparison.payables.map((p) => [p.payableId, p.amount]),
    );
    const dueDate = invoiceDueDate(
      invoice.invoiceDate,
      invoice.supplier.paymentTermDays ?? 0,
    );

    const payables = await this.invoices.lockPayables(tenantId, id, tx);
    for (const payable of payables) {
      const amount = amounts.get(payable.id) ?? 0;
      const after = payableAfterInvoice({
        amount,
        paidAmount: Number(payable.paidAmount),
        advanceApplied: Number(payable.advanceApplied),
      });
      if (after.overpaid > 0) {
        throw new UnprocessableEntityException(
          `Ya se le pagaron ${gs(after.overpaid)} más que lo que dice la factura. Reclamá la diferencia al proveedor o rechazá la factura.`,
        );
      }
      await this.invoices.updatePayable(
        tenantId,
        payable.id,
        {
          // La estimación original se conserva para poder mostrar el cambio.
          estimatedAmount: payable.estimatedAmount ?? payable.amount,
          amount,
          paidAmount: after.paidAmount,
          advanceApplied: after.advanceApplied,
          status: after.status,
          dueDate,
        },
        tx,
      );
    }
  }

  private audit(
    tenantId: string,
    userId: string | undefined,
    resourceId: string,
    action: string,
    after: Record<string, unknown>,
  ) {
    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'procurement',
      action,
      resourceId,
      after,
    } satisfies AuditLogEvent);
  }
}
