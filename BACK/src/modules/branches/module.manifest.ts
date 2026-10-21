import { defineModule } from '../../common/modules/module-manifest';

export const branchesManifest = defineModule({
  key: 'branches',
  kind: 'core',
  displayName: 'Sucursales',
  description: 'Sucursales de la empresa',
  icon: 'Building2',
  isStable: true,
  depends: [],
  owns: ['Branch'],
});
