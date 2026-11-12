import { FolderOpen } from 'lucide-react';
import type { FrontModuleManifest } from '../types';

export const documentsManifest: FrontModuleManifest = {
  id: 'documents',
  module: 'documents',
  sections: [
    { id: 'documents', label: 'Documentos', icon: FolderOpen, order: 170, flat: true },
  ],
  nav: [{ section: 'documents', label: 'Documentos', href: '/dashboard/documents' }],
  routes: [{ prefix: '/dashboard/documents', anyPermission: ['documents:read'] }],
};
