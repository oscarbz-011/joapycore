import type { Industry } from '@prisma/client';
import type { AuditLogEvent } from '../../audit/audit-log.event';
import type { SessionInvalidateEvent } from './session-invalidate.event';

// Contrato de los eventos entre módulos: un nombre, un payload. Un cambio
// incompatible se publica con un nombre nuevo (p. ej. `invoice.issued.v2`) y
// el viejo se mantiene hasta que no quede quien lo escuche: los eventos del
// outbox pueden estar guardados con el payload anterior.

interface Tenant {
  tenantId: string;
}
interface SaleOrderRef extends Tenant {
  saleOrderId: string;
}
interface DeliveryRef extends Tenant {
  deliveryNoteId: string;
}

// Viaja por el outbox: las fechas llegan como texto ISO. Una factura de
// interés no tiene pedido.
interface InvoiceIssued extends Tenant {
  invoiceId: string;
  saleOrderId: string | null;
  paymentCondition: 'CASH' | 'CREDIT';
  total: number;
  dueDate: string | null;
  issuedById?: string | null;
}

export interface DomainEvents {
  'audit.log': AuditLogEvent;
  'auth.session.invalidate': SessionInvalidateEvent;

  'tenant.registered': Tenant & { industry: Industry | null | undefined };
  'tenant.module.activated': Tenant & { moduleName: string };
  'user.registered': Tenant & { userId: string };
  'user.logged_in': Tenant & { userId: string };

  'customer.created': Tenant & { customerId: string };
  'customer.updated': Tenant & { customerId: string };
  'customer.deleted': Tenant & { customerId: string };

  'sale.order.completed': SaleOrderRef;
  'sale.order.quoted': SaleOrderRef & { issuedById?: string };
  'sale.order.quote_pdf.requested': SaleOrderRef & { issuedById?: string };
  'sale.order.stock_out': SaleOrderRef;
  'sale.payment.collected': SaleOrderRef;
  'sale.credit.requested': SaleOrderRef;
  'sale.credit.approved': SaleOrderRef;
  'sale.credit.rejected': SaleOrderRef;
  'sale.credit.adjustment_requested': SaleOrderRef;

  'invoice.created': Tenant & { invoiceId: string };
  'invoice.issued': InvoiceIssued;
  'invoice.pdf.requested': InvoiceIssued & {
    attemptAt: Date;
    expectedStatus: 'PENDING' | 'ISSUED' | 'PAID';
  };
  'invoice.duedate.selected': SaleOrderRef & { dueDate: string };
  'invoice.interest.issued': Tenant & {
    invoiceId: string;
    paymentReceiptId: string | null;
    total: number;
  };
  'invoice.cancelled': Tenant & { invoiceId: string };

  'payment.ar.completed': Tenant & { arId: string; invoiceId: string };
  'payment.ap.completed': Tenant & { apId: string; purchaseReceiptId: string };
  'payment.receipt.created': Tenant & { receiptId: string };
  'payment.receipt.pdf.requested': Tenant & { receiptId: string };
  'installment.paid': SaleOrderRef & {
    loanId: string;
    installmentId: string;
    amount: number;
  };
  'loan.paid': Tenant & { loanId: string };

  'stock.movement.created': Tenant & {
    productId: string;
    type: string;
    quantity: number;
  };
  'production.order.completed': Tenant & {
    productionOrderId: string;
    productId: string;
    quantity: number;
    warehouseId: string | null;
    consumed: { productId: string; quantity: number }[];
  };
  'purchase.order.confirmed': Tenant & { purchaseOrderId: string };
  'purchase.order.pdf.requested': Tenant & {
    purchaseOrderId: string;
    requestedById?: string;
  };
  'purchase.receipt.created': Tenant & {
    purchaseOrderId: string;
    purchaseReceiptId: string;
    warehouseId?: string;
  };

  'delivery.note.created': Tenant & {
    saleOrderId?: string;
    deliveryNoteId?: string;
  };
  'delivery.note.delivered': SaleOrderRef & {
    deliveryNoteId: string;
    userId?: string;
  };
  'delivery.dispatched': SaleOrderRef & { deliveryNoteId: string };
  'delivery.assigned': DeliveryRef;
  'delivery.seller.requested': DeliveryRef;
  'delivery.tracking.recorded': DeliveryRef;
  'delivery.route.changed': Tenant;

  'pos.session.opened': Tenant & {
    sessionId: string;
    terminalId: string;
    cashierId: string;
    openingCash: number;
  };
  'pos.session.closed': Tenant & {
    sessionId: string;
    expectedCash: number;
    closingCash: number;
    difference: number;
    status: string;
  };
  'pos.sale.created': SaleOrderRef & { posSessionId: string };

  'hr.leave.requested': Tenant & { leaveId: string };
  'hr.leave.approved': Tenant & { leaveId: string };
  'hr.leave.rejected': Tenant & { leaveId: string };
  'hr.leave.cancelled': Tenant & { leaveId: string };

  'application.email.sent': Tenant & { messageId: string };
  'application.email.unknown': Tenant & { messageId: string };
  'calendar.changed': Tenant;
}

export type DomainEventName = keyof DomainEvents;
