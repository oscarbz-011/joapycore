import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * Lecturas de datos de otros módulos (facturas, pedidos, recibos, clientes)
 * que Documentos necesita para generar PDFs, y el enlace del PDF generado
 * de vuelta a su entidad. Quedan agrupadas acá para que ningún listener ni
 * servicio consulte Prisma directo.
 */
@Injectable()
export class DocumentSourcesRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ── Facturas ───────────────────────────────────────────────────────────────

  findInvoiceForPdf(tenantId: string, invoiceId: string) {
    return this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
      include: {
        tenant: true,
        items: true,
        saleOrder: {
          include: {
            customer: true,
            branch: true,
            downPayment: true,
            loan: {
              include: {
                installments: { orderBy: { number: 'asc' }, take: 1 },
              },
            },
          },
        },
      },
    });
  }

  findInterestInvoiceForPdf(tenantId: string, invoiceId: string) {
    return this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
      include: {
        tenant: true,
        items: true,
        paymentReceipt: { include: { customer: true } },
      },
    });
  }

  setInvoicePdf(tenantId: string, invoiceId: string, fileId: string) {
    return this.prisma.invoice.updateMany({
      where: { id: invoiceId, tenantId },
      data: { pdfFileId: fileId },
    });
  }

  // ── Pedidos de venta ───────────────────────────────────────────────────────

  findQuoteForPdf(tenantId: string, saleOrderId: string) {
    return this.prisma.saleOrder.findFirst({
      where: { id: saleOrderId, tenantId },
      include: {
        tenant: true,
        customer: true,
        items: { include: { product: true } },
      },
    });
  }

  setQuotePdf(tenantId: string, saleOrderId: string, fileId: string) {
    return this.prisma.saleOrder.updateMany({
      where: { id: saleOrderId, tenantId },
      data: { quotePdfFileId: fileId },
    });
  }

  findSaleOrderForContract(tenantId: string, saleOrderId: string) {
    return this.prisma.saleOrder.findFirst({
      where: { id: saleOrderId, tenantId },
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
  }

  findSaleOrderWithCustomer(tenantId: string, saleOrderId: string) {
    return this.prisma.saleOrder.findFirst({
      where: { id: saleOrderId, tenantId },
      include: { customer: true },
    });
  }

  // ── Recibos y clientes ─────────────────────────────────────────────────────

  findReceiptForPdf(tenantId: string, receiptId: string) {
    return this.prisma.paymentReceipt.findFirst({
      where: { id: receiptId, tenantId },
      include: {
        tenant: true,
        customer: true,
        branch: true,
        collectedBy: true,
        items: { orderBy: { installmentNumber: 'asc' } },
      },
    });
  }

  setReceiptPdf(tenantId: string, receiptId: string, fileId: string) {
    return this.prisma.paymentReceipt.updateMany({
      where: { id: receiptId, tenantId },
      data: { pdfFileId: fileId },
    });
  }

  findCustomer(tenantId: string, customerId: string) {
    return this.prisma.customer.findFirst({
      where: { id: customerId, tenantId },
    });
  }
}
