import { defineModule } from '../../common/modules/module-manifest';

export const posManifest = defineModule({
  key: 'pos',
  kind: 'addon',
  displayName: 'Punto de Venta',
  description: 'Venta rápida con código de barras y caja',
  icon: 'Monitor',
  isStable: false,
  category: 'Punto de Venta',
  depends: ['sales', 'inventory', 'billing'],
  owns: ['PosTerminal', 'PosSession'],
});
