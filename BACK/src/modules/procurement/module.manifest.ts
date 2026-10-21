import { defineModule } from '../../common/modules/module-manifest';

export const procurementManifest = defineModule({
  key: 'procurement',
  kind: 'addon',
  displayName: 'Compras',
  description: 'Órdenes de compra y gestión de proveedores',
  icon: 'Truck',
  isStable: true,
  depends: ['inventory'],
  owns: [
    'Supplier',
    'SupplierCatalogItem',
    'PurchaseOrder',
    'PurchaseOrderItem',
    'PurchaseOrderStatusChange',
    'PurchaseReceipt',
    'PurchaseReceiptItem',
    'AccountsPayable',
    'SupplierInvoice',
    'SupplierInvoiceItem',
    'SupplierPayment',
  ],
});
