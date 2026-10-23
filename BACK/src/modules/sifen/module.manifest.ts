import { defineModule } from '../../common/modules/module-manifest';

export const sifenManifest = defineModule({
  key: 'sifen',
  kind: 'core',
  displayName: 'SIFEN',
  description: 'Configuración de facturación electrónica',
  icon: 'Receipt',
  isStable: true,
  depends: [],
  owns: ['SifenConfig'],
});
