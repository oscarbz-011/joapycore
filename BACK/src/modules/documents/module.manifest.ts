import { defineModule } from '../../common/modules/module-manifest';

export const documentsManifest = defineModule({
  key: 'documents',
  kind: 'addon',
  displayName: 'Documentos',
  description: 'Repositorio de documentos, políticas, manuales y contratos',
  icon: 'FolderOpen',
  isStable: false,
  depends: [],
  owns: ['DocumentCategory', 'Document'],
});
