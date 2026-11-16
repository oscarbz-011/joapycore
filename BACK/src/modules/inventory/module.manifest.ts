import { defineModule } from '../../common/modules/module-manifest';

export const inventoryManifest = defineModule({
  key: 'inventory',
  kind: 'addon',
  displayName: 'Inventario',
  description: 'Gestión de productos, stock y movimientos de almacén',
  icon: 'Package',
  isStable: true,
  category: 'Inventario y Productos',
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
