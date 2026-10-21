import { defineModule } from '../../common/modules/module-manifest';

export const alertsManifest = defineModule({
  key: 'alerts',
  kind: 'core',
  displayName: 'Alertas',
  description: 'Reglas de alerta del tenant',
  icon: 'Bell',
  isStable: true,
  depends: [],
  owns: ['AlertConfig'],
});
