import { Injectable } from '@nestjs/common';
import { InvoiceStatus, PaymentMethod, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaClientOrTx } from '../../../prisma/types';
import type { SeriesNumbering } from '../types/series-numbering';

// Lo que hace falta para imprimir una factura: en papel térmico, en A4 o
// sobre la hoja de un talonario.
const receiptSelect = {
  id: true,
  modality: true,
  invoicePrefix: true,
  invoiceNumber: true,
  timbrado: true,
  timbradoValidFrom: true,
  timbradoValidUntil: true,
  issuedAt: true,
  total: true,
  anonymousBuyer: true,
  status: true,
  invoiceType: true,
  sequential: true,
  seriesId: true,
  formPrintCount: true,
  formPrintedAt: true,
  physicalScan: { select: { id: true, originalName: true, mimeType: true } },
  series: { select: { printLayout: true } },
  tenant: {
    select: {
      name: true,
      razonSocial: true,
      nombreFantasia: true,
      ruc: true,
      address: true,
      numeroCasa: true,
      city: true,
      phone: true,
      actividadesEconomicas: true,
    },
  },
  saleOrder: {
    select: {
      saleType: true,
      customer: {
        select: {
          firstName: true,
          secondFirstName: true,
          lastName: true,
          secondLastName: true,
          documentType: true,
          documentNumber: true,
          taxpayerType: true,
          address: true,
        },
      },
      branch: {
        select: {
          name: true,
          address: true,
          numeroCasa: true,
          city: true,
        },
      },
    },
  },
  paymentReceipt: {
    select: {
      customer: {
        select: {
          firstName: true,
          secondFirstName: true,
          lastName: true,
          secondLastName: true,
          documentType: true,
          documentNumber: true,
          taxpayerType: true,
          address: true,
        },
      },
      branch: {
        select: { name: true, address: true, numeroCasa: true, city: true },
      },
    },
  },
  items: {
    select: {
      description: true,
      quantity: true,
      unitPrice: true,
      total: true,
      ivaRate: true,
      ivaAmount: true,
    },
  },
} satisfies Prisma.InvoiceSelect;

@Injectable()
export class InvoicesRepository {
  private static readonly STALE_CLAIM_MS = 5 * 60 * 1000;

  constructor(private readonly prisma: PrismaService) {}

  private get include() {
    return {
      tenant: {
        select: {
          razonSocial: true,
          nombreFantasia: true,
          ruc: true,
          address: true,
          numeroCasa: true,
          city: true,
          department: true,
          phone: true,
          logoFileId: true,
        },
      },
      saleOrder: {
        include: {
          customer: true,
          downPayment: true,
          loan: {
            select: {
              totalAmount: true,
              interestRate: true,
              totalInstallments: true,
              installments: {
                orderBy: { number: 'asc' as const },
                take: 1,
                select: { dueDate: true },
              },
            },
          },
          branch: {
            select: {
              id: true,
              name: true,
              address: true,
              numeroCasa: true,
              city: true,
              phone: true,
              codigoEstablecimiento: true,
              puntoExpedicion: true,
            },
          },
        },
      },
      items: true,
      physicalScan: {
        select: { id: true, originalName: true, mimeType: true },
      },
    };
  }

  findAll(tenantId: string) {
    // Solo facturas de venta — las de intereses moratorios (invoiceType
    // INTEREST) no tienen saleOrder y se acceden desde el recibo de pago que
    // las generó, no desde el listado general de Facturación.
    return this.prisma.invoice.findMany({
      where: { tenantId, invoiceType: 'SALE' },
      include: this.include,
      orderBy: { createdAt: 'desc' },
    });
  }

  // Facturas de intereses moratorios: no tienen pedido de venta, el cliente
  // sale del recibo de cobro que las originó.
  findInterestInvoices(tenantId: string) {
    return this.prisma.invoice.findMany({
      where: { tenantId, invoiceType: 'INTEREST' },
      select: {
        id: true,
        status: true,
        issuedAt: true,
        createdAt: true,
        total: true,
        invoiceNumber: true,
        invoicePrefix: true,
        sequential: true,
        pdfFileId: true,
        modality: true,
        paymentReceipt: {
          select: {
            id: true,
            receiptNumber: true,
            customer: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  findById(tenantId: string, id: string) {
    return this.prisma.invoice.findFirst({
      where: { id, tenantId },
      include: this.include,
    });
  }

  findBySaleOrder(tenantId: string, saleOrderId: string) {
    return this.prisma.invoice.findFirst({
      where: { tenantId, saleOrderId },
      include: this.include,
    });
  }

  async hasPdf(tenantId: string, id: string): Promise<boolean> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, tenantId, pdfFileId: { not: null } },
      select: { id: true },
    });
    return Boolean(invoice);
  }

  create(
    data: Prisma.InvoiceUncheckedCreateInput,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.invoice.create({ data });
  }

  createItem(
    data: Prisma.InvoiceItemUncheckedCreateInput,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.invoiceItem.create({ data });
  }

  createInterestInvoice(
    tenantId: string,
    data: {
      paymentReceiptId: string;
      numbering: SeriesNumbering | null;
      total: number;
      issuedAt: Date;
      items: {
        description: string;
        quantity: number;
        unitPrice: number;
        total: number;
        ivaRate: number;
        ivaAmount: number;
        unitPriceWithoutIva: number;
      }[];
    },
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.invoice.create({
      data: {
        tenantId,
        invoiceType: 'INTEREST',
        status: 'PAID',
        saleOrderId: null,
        paymentReceiptId: data.paymentReceiptId,
        ...(data.numbering ?? {}),
        total: data.total,
        issuedAt: data.issuedAt,
        items: { create: data.items },
      },
      include: { items: true },
    });
  }

  // Factura de una venta ya cobrada en caja: nace pagada y numerada.
  createPaid(
    tenantId: string,
    data: {
      saleOrderId: string;
      numbering: SeriesNumbering;
      total: number;
      issuedAt: Date;
      paymentMethod: PaymentMethod | null;
      anonymousBuyer: boolean;
      items: Omit<Prisma.InvoiceItemCreateManyInvoiceInput, 'id'>[];
    },
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.invoice.create({
      data: {
        tenantId,
        saleOrderId: data.saleOrderId,
        invoiceType: 'SALE',
        status: 'PAID',
        ...data.numbering,
        total: data.total,
        issuedAt: data.issuedAt,
        paymentMethod: data.paymentMethod,
        anonymousBuyer: data.anonymousBuyer,
        items: { create: data.items },
      },
      select: { id: true },
    });
  }

  findForReceipt(tenantId: string, saleOrderId: string) {
    return this.prisma.invoice.findFirst({
      where: { tenantId, saleOrderId },
      select: receiptSelect,
    });
  }

  // Factura de venta o de intereses a imprimir sobre la hoja del talonario.
  findForForm(tenantId: string, id: string) {
    return this.prisma.invoice.findFirst({
      where: { id, tenantId },
      select: receiptSelect,
    });
  }

  findInterestForNumbering(tenantId: string, id: string) {
    return this.prisma.invoice.findFirst({
      where: { id, tenantId, invoiceType: 'INTEREST', status: 'PAID' },
      select: {
        id: true,
        sequential: true,
        issuedAt: true,
        total: true,
        paymentReceiptId: true,
        paymentReceipt: { select: { branchId: true } },
      },
    });
  }

  assignNumber(
    tenantId: string,
    id: string,
    numbering: SeriesNumbering,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.invoice.updateMany({
      where: { id, tenantId, invoiceType: 'INTEREST', sequential: null },
      data: numbering,
    });
  }

  updateStatus(
    tenantId: string,
    id: string,
    status: InvoiceStatus,
    extra?: Partial<Prisma.InvoiceUncheckedUpdateManyInput>,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.invoice.updateMany({
      where: { id, tenantId },
      data: { status, ...extra },
    });
  }

  claimIssue(
    tenantId: string,
    id: string,
    observedUpdatedAt: Date,
    attemptAt: Date,
    data: Partial<Prisma.InvoiceUncheckedUpdateManyInput>,
    client: PrismaClientOrTx = this.prisma,
  ) {
    const staleBefore = new Date(
      attemptAt.getTime() - InvoicesRepository.STALE_CLAIM_MS,
    );
    return client.invoice.updateMany({
      where: {
        id,
        tenantId,
        status: 'PENDING',
        pdfFileId: null,
        updatedAt: observedUpdatedAt,
        OR: [{ issuedAt: null }, { issuedAt: { lt: staleBefore } }],
      },
      data: {
        ...data,
        dueDate: data.dueDate ?? null,
        notes: data.notes ?? null,
        issuedAt: attemptAt,
      },
    });
  }

  releaseIssueClaim(
    tenantId: string,
    id: string,
    attemptAt: Date,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.invoice.updateMany({
      where: {
        id,
        tenantId,
        status: 'PENDING',
        pdfFileId: null,
        issuedAt: attemptAt,
      },
      data: {
        issuedAt: null,
        dueDate: null,
        paymentMethod: null,
        notes: null,
      },
    });
  }

  cancelIfAllowed(
    tenantId: string,
    id: string,
    status: 'PENDING' | 'ISSUED',
    observedUpdatedAt: Date,
    now: Date,
    client: PrismaClientOrTx = this.prisma,
  ) {
    const staleBefore = new Date(
      now.getTime() - InvoicesRepository.STALE_CLAIM_MS,
    );
    return client.invoice.updateMany({
      where: {
        id,
        tenantId,
        status,
        updatedAt: observedUpdatedAt,
        ...(status === 'PENDING'
          ? {
              pdfFileId: null,
              OR: [{ issuedAt: null }, { issuedAt: { lt: staleBefore } }],
            }
          : {}),
      },
      data: { status: 'CANCELLED' },
    });
  }

  /**
   * Último paso de una emisión: solo permite pasar a ISSUED si el PDF ya fue
   * persistido. La condición vive en la base para que ninguna llamada pueda
   * confirmar una factura sin comprobante por una carrera entre requests.
   */
  finalizeIssue(
    tenantId: string,
    id: string,
    attemptAt: Date,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.invoice.updateMany({
      where: {
        id,
        tenantId,
        status: 'PENDING',
        pdfFileId: { not: null },
        issuedAt: attemptAt,
      },
      data: { status: 'ISSUED' },
    });
  }

  /**
   * Emite una factura de talonario de imprenta: el comprobante es la hoja
   * preimpresa, así que pasa a ISSUED sin esperar un PDF.
   */
  issuePreprinted(
    tenantId: string,
    id: string,
    observedUpdatedAt: Date,
    attemptAt: Date,
    data: Partial<Prisma.InvoiceUncheckedUpdateManyInput>,
    client: PrismaClientOrTx = this.prisma,
  ) {
    const staleBefore = new Date(
      attemptAt.getTime() - InvoicesRepository.STALE_CLAIM_MS,
    );
    return client.invoice.updateMany({
      where: {
        id,
        tenantId,
        status: 'PENDING',
        pdfFileId: null,
        updatedAt: observedUpdatedAt,
        OR: [{ issuedAt: null }, { issuedAt: { lt: staleBefore } }],
      },
      data: {
        ...data,
        dueDate: data.dueDate ?? null,
        notes: data.notes ?? null,
        issuedAt: attemptAt,
        status: 'ISSUED',
      },
    });
  }

  recordFormPrint(tenantId: string, id: string, at: Date) {
    return this.prisma.invoice.updateMany({
      where: {
        id,
        tenantId,
        modality: 'PREPRINTED',
        sequential: { not: null },
      },
      data: { formPrintCount: { increment: 1 }, formPrintedAt: at },
    });
  }

  // La factura pasa a otra hoja del talonario: lo impreso y el escaneo eran
  // de la hoja anterior.
  moveToSheet(
    tenantId: string,
    id: string,
    fromSequential: number,
    numbering: SeriesNumbering,
    client: PrismaClientOrTx,
  ) {
    return client.invoice.updateMany({
      where: {
        id,
        tenantId,
        modality: 'PREPRINTED',
        sequential: fromSequential,
        status: { in: ['ISSUED', 'PAID'] },
      },
      data: {
        ...numbering,
        formPrintCount: 0,
        formPrintedAt: null,
        physicalScanFileId: null,
      },
    });
  }

  setPhysicalScan(tenantId: string, id: string, fileId: string | null) {
    return this.prisma.invoice.updateMany({
      where: {
        id,
        tenantId,
        modality: 'PREPRINTED',
        sequential: { not: null },
      },
      data: { physicalScanFileId: fileId },
    });
  }
}
