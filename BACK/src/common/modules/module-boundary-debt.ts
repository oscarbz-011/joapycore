// Accesos a tablas de otro módulo que existían cuando se declararon los
// dueños (2026-10). Se van sacando a medida que pasan a contratos, eventos o
// al repositorio de fuentes; no se agregan entradas nuevas.
export const KNOWN_BOUNDARY_DEBT: Record<string, string[]> = {
  // Escritura ajena que queda para la reestructuración de Finanzas.
  'modules/finance/repositories/finance-sources.repository.ts': [
    'write:DelinquencyReport',
  ],

  // Lecturas de módulos que se pueden apagar y de los que el lector no depende.
  'modules/inventory/repositories/product-suppliers.repository.ts': [
    'read:Supplier',
  ],
  'modules/reports/repositories/reports.repository.ts': [
    'read:AccountsReceivable',
    'read:Product',
    'read:SaleOrder',
  ],
};
