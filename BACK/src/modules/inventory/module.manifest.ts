import { defineModule } from '../../common/modules/module-manifest';

export const inventoryManifest = defineModule({
  key: 'inventory',
  kind: 'addon',
  displayName: 'Inventario',
  description: 'Gestión de productos, stock y movimientos de almacén',
  icon: 'Package',
  isStable: true,
  depends: ['warehouses', 'alerts'],
  owns: [
    'Category',
    'Brand',
    'Product',
    'ProductSupplier',
    'ProductUnit',
    'ProductBatch',
    'StockMovement',
  ],
});
