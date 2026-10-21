import { defineModule } from '../../common/modules/module-manifest';

// La carpeta conserva el nombre en español; la clave es la que TenantModule
// guarda desde el principio.
export const collectionsManifest = defineModule({
  key: 'collections',
  kind: 'addon',
  displayName: 'Cobranzas',
  description: 'Asignación de cobradores y gestión de mora',
  icon: 'ClipboardList',
  isStable: false,
  depends: ['finance'],
  owns: [
    'CollectionRoute',
    'CollectionVisit',
    'CollectionNote',
    'PaymentAgreement',
    'DelinquencyReport',
  ],
});
