import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * Lecturas de datos de otros módulos (facturas, pedidos, recibos, clientes)
 * que Documentos necesita para generar PDFs. El PDF generado lo vincula el
 * dueño de cada documento por su contrato (ver document-pdf.contract.ts).
 * Quedan agrupadas acá para que ningún listener ni servicio consulte Prisma
 * directo.
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

  findInterestInvoiceByReceipt(tenantId: string, paymentReceiptId: string) {
    return this.prisma.invoice.findFirst({
      where: { tenantId, paymentReceiptId, invoiceType: 'INTEREST' },
      select: { id: true, total: true, pdfFileId: true },
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

  findPurchaseOrderForPdf(tenantId: string, purchaseOrderId: string) {
    return this.prisma.purchaseOrder.findFirst({
      where: { id: purchaseOrderId, tenantId },
      include: {
        tenant: true,
        branch: true,
        supplier: true,
        items: {
          include: { product: { select: { name: true, unit: true } } },
        },
      },
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

  findCustomer(tenantId: string, customerId: string) {
    return this.prisma.customer.findFirst({
      where: { id: customerId, tenantId },
    });
  }
}
