import type { FrontModuleManifest } from '../types';

export const collectionsManifest: FrontModuleManifest = {
  id: 'collections',
  module: 'collections',
  nav: [{ section: 'creditos-cobranzas', label: 'Cobranzas', href: '/dashboard/cobranzas' }],
  routes: [{ prefix: '/dashboard/cobranzas', anyPermission: ['collections:read'] }],
};
