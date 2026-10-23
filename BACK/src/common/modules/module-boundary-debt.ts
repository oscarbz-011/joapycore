// Accesos a tablas de otro módulo que existían cuando se declararon los
// dueños (2026-10). Se van sacando a medida que pasan a contratos, eventos o
// al repositorio de fuentes; no se agregan entradas nuevas.
export const KNOWN_BOUNDARY_DEBT: Record<string, string[]> = {
  // Escrituras en tablas ajenas: las más urgentes de mover a eventos.
  'modules/documents/repositories/document-sources.repository.ts': [
    'write:Invoice',
    'write:PaymentReceipt',
    'write:PurchaseOrder',
    'write:SaleOrder',
  ],
  'modules/finance/repositories/finance-sources.repository.ts': [
    'write:DelinquencyReport',
  ],
  'modules/hr/repositories/employee-accounts.repository.ts': [
    'read:Branch',
    'read:User',
    'write:User',
    'write:UserRole',
  ],
  'modules/inventory/repositories/stock-sources.repository.ts': [
    'write:SaleOrderItem',
  ],
  'modules/logistics/repositories/logistics-sources.repository.ts': [
    'write:Customer',
  ],

  // Lecturas fuera del repositorio de fuentes.
  'modules/cobranzas/repositories/delinquency-reports.repository.ts': [
    'read:Installment',
  ],
  'modules/inventory/repositories/product-suppliers.repository.ts': [
    'read:Supplier',
  ],
  'modules/inventory/repositories/products.repository.ts': ['read:Tenant'],
  'modules/inventory/repositories/stock-locations.repository.ts': [
    'read:Warehouse',
  ],
  'modules/inventory/repositories/stock.repository.ts': ['read:Warehouse'],
  'modules/pos/repositories/pos-sales.repository.ts': ['read:SaleOrder'],
  'modules/pos/repositories/pos-sessions.repository.ts': ['read:SalePayment'],
  'modules/procurement/repositories/purchase-orders.repository.ts': [
    'read:Product',
  ],
  'modules/procurement/repositories/supplier-catalog.repository.ts': [
    'read:Product',
  ],
  'modules/production/repositories/product-components.repository.ts': [
    'read:Product',
  ],
  'modules/production/repositories/production-orders.repository.ts': [
    'read:Product',
    'read:StockMovement',
  ],
  'modules/reports/repositories/reports.repository.ts': [
    'read:AccountsReceivable',
    'read:Product',
    'read:SaleOrder',
  ],

  // Plataforma (fuera de src/modules) sobre tablas de módulos.
  'tenants/repositories/tenants.repository.ts': [
    'write:Branch',
    'write:Warehouse',
  ],
  'communications/communications.repository.ts': ['read:Invoice'],
  'communications/conversations.repository.ts': ['read:Customer'],
  'communications/hub.service.ts': ['read:Invoice'],
};
