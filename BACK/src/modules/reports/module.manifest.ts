import { defineModule } from '../../common/modules/module-manifest';

// Sin datos propios: los pide por contrato a cada dueño (report-sources).
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
