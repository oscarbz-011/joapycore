import { Monitor } from 'lucide-react';
import type { FrontModuleManifest } from '../types';

export const posManifest: FrontModuleManifest = {
  id: 'pos',
  module: 'pos',
  settingsHref: '/dashboard/settings/pos-terminals',
  sections: [{ id: 'pos', label: 'POS', icon: Monitor, order: 150 }],
  nav: [
    { section: 'pos', label: 'POS', href: '/dashboard/pos' },
    { section: 'pos', label: 'Órdenes POS', href: '/dashboard/pos/history' },
    ...[
      'Impresión de códigos de barra',
      'Impresión de códigos QR',
      'Configuración de impresión',
    ].map((label) => ({ section: 'pos', label, href: '#', stub: true })),
  ],
  routes: [
    { prefix: '/dashboard/pos', anyPermission: ['pos:sell'] },
    { prefix: '/dashboard/pos/history', anyPermission: ['pos:session:manage'] },
    { prefix: '/dashboard/settings/pos-terminals', anyPermission: ['pos:terminals:manage'] },
  ],
};
