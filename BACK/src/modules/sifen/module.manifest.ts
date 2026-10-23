import { defineModule } from '../../common/modules/module-manifest';

export const sifenManifest = defineModule({
  key: 'sifen',
  kind: 'addon',
  displayName: 'Facturación electrónica',
  description:
    'Certificado digital y emisión de documentos electrónicos ante SIFEN',
  icon: 'Receipt',
  isStable: true,
  depends: ['billing'],
  owns: ['SifenConfig'],
});
