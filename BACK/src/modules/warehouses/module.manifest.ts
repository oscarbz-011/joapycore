import { defineModule } from '../../common/modules/module-manifest';

export const warehousesManifest = defineModule({
  key: 'warehouses',
  kind: 'core',
  displayName: 'Depósitos',
  description: 'Depósitos donde se guarda la mercadería',
  icon: 'Warehouse',
  isStable: true,
  depends: [],
  owns: ['Warehouse'],
});
