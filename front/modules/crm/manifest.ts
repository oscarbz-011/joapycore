import { Network } from 'lucide-react';
import type { FrontModuleManifest } from '../types';

// Anunciado en el catálogo, todavía sin pantallas.
export const crmManifest: FrontModuleManifest = {
  id: 'crm',
  module: 'crm',
  sections: [{ id: 'crm', label: 'CRM', icon: Network, order: 130 }],
  nav: [
    'Contactos',
    'Leads',
    'Deals',
    'Pipeline',
    'Campañas',
    'Comentarios de clientes',
  ].map((label) => ({ section: 'crm', label, href: '#', stub: true })),
};
