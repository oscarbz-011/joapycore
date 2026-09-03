export const WS_EVENT_MAP: Record<string, string[][]> = {
  'sale.order.completed':          [['sale-orders']],
  'sale.order.cancelled':          [['sale-orders']],
  // Entra/reentra a PENDING_CREDIT_APPROVAL — mueve el conteo del badge
  // "Evaluación de crédito" del sidebar.
  'sale.credit.requested':         [['sale-orders'], ['pending-approvals']],
  'sale.credit.approved':          [['sale-orders'], ['pending-approvals']],
  'sale.credit.rejected':          [['sale-orders'], ['pending-approvals']],
  'sale.credit.adjustment_requested': [['sale-orders'], ['pending-approvals']],
  // 'invoice.created' = factura recién generada en estado PENDING (aún no
  // emitida) — mueve el badge "Facturas" del sidebar.
  'invoice.created':          [['invoices']],
  'invoice.issued':           [['invoices'], ['accounts-receivable']],
  'invoice.cancelled':        [['invoices']],
  'payment.registered':       [['accounts-receivable']],
  'payment.ar.completed':     [['accounts-receivable'], ['invoices']],
  'stock.movement.created':   [['products'], ['stock-movements']],
  'installment.paid':         [['loans']],
  'employee.created':         [['hr-employees']],
  'employee.terminated':      [['hr-employees']],
  // Recepción de compra confirmada — mueve la orden (receivedQty/estado) y,
  // vía el listener de inventory, el stock/lotes resultantes.
  'purchase.receipt.created': [['purchase-orders'], ['purchase-receipts'], ['products'], ['product-batches'], ['accounts-payable']],
  'payment.ap.completed':     [['accounts-payable']],
  // Entra a CONFIRMED — mueve el badge "Compras" (entregas pendientes/vencidas).
  'purchase.order.confirmed': [['purchase-orders']],
  // Nota de entrega nueva en PENDING — mueve el badge "Entregas" de Logística.
  'delivery.note.created':    [['logistics-deliveries']],
  'delivery.dispatched':      [['logistics-deliveries']],
  'delivery.note.delivered':  [['logistics-deliveries']],
  'delivery.assigned':        [['logistics-deliveries']],
  'delivery.tracking.recorded': [['logistics-deliveries'], ['logistics-mine']],
  // Clientes se lee bajo dos keys distintas hoy (sales/page.tsx y
  // customers/page.tsx usan 'sale-customers'; pos/page.tsx usa 'customers')
  // — se invalidan las dos hasta unificarlas.
  'customer.created':         [['sale-customers'], ['customers']],
  // También logistics-deliveries/logistics-mine: una nota de entrega muestra
  // los datos del cliente (dirección, coordenadas) embebidos vía relación —
  // si se corrigen desde la ficha del cliente (ej. se cargan las
  // coordenadas de entrega), una pantalla de Logística ya abierta tiene que
  // refrescar sola, no quedarse con "Sin ubicación registrada" desactualizado.
  'customer.updated':         [['sale-customers'], ['customers'], ['logistics-deliveries'], ['logistics-mine']],
  'customer.deleted':         [['sale-customers'], ['customers']],
};
