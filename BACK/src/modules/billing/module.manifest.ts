import { defineModule } from '../../common/modules/module-manifest';

export const billingManifest = defineModule({
  key: 'billing',
  kind: 'addon',
  displayName: 'Facturación',
  description: 'Emisión y administración de facturas',
  icon: 'FileText',
  isStable: true,
  depends: ['sales'],
  bundledWith: 'sales',
  owns: ['Invoice', 'InvoiceItem', 'CreditNote', 'BillingSeries'],
});
