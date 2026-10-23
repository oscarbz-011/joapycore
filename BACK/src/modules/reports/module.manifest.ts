import { defineModule } from '../../common/modules/module-manifest';

// Solo lee: los reportes cruzan datos de varios módulos.
export const reportsManifest = defineModule({
  key: 'reports',
  kind: 'core',
  displayName: 'Reportes',
  description: 'Reportes de ventas, stock y cobranzas',
  icon: 'BarChart3',
  isStable: true,
  depends: [],
  owns: [],
});
