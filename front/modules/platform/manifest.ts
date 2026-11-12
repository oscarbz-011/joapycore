import {
  AppWindow,
  Building2,
  Calculator,
  Crown,
  HandCoins,
  Headphones,
  Landmark,
  Settings,
} from 'lucide-react';
import { COMMUNICATIONS_PATH } from '@/lib/api/communications';
import { CALENDAR_PATH } from '@/lib/calendar';
import { CHAT_PATH } from '@/lib/chat';
import { NOTES_PATH } from '@/lib/notes';
import type { FrontModuleManifest } from '../types';

// Lo que no se apaga: aplicaciones, empresa, sistema y las entradas del área
// financiera que reúnen pantallas de varios módulos.
export const platformManifest: FrontModuleManifest = {
  id: 'platform',
  sections: [
    {
      id: 'apps',
      label: 'Aplicaciones',
      icon: AppWindow,
      order: 10,
      badgeWhenClosed: true,
      matchPrefix: true,
    },
    {
      id: 'creditos-cobranzas',
      label: 'Créditos y Cobranzas',
      icon: HandCoins,
      order: 70,
    },
    { id: 'tesoreria', label: 'Tesorería', icon: Landmark, order: 80 },
    { id: 'contabilidad', label: 'Contabilidad', icon: Calculator, order: 90 },
    { id: 'empresa', label: 'Empresa', icon: Building2, order: 10, bottom: true },
    { id: 'membership', label: 'Membresía', icon: Crown, order: 20, bottom: true },
    { id: 'support', label: 'Soporte', icon: Headphones, order: 30, bottom: true },
    { id: 'sistema', label: 'Sistema', icon: Settings, order: 40, bottom: true },
  ],
  nav: [
    { section: 'apps', label: 'Comunicaciones', href: COMMUNICATIONS_PATH },
    { section: 'apps', label: 'Chat', href: CHAT_PATH },
    { section: 'apps', label: 'Calendario', href: CALENDAR_PATH },
    { section: 'apps', label: 'Notas', href: NOTES_PATH },

    { section: 'tesoreria', label: 'Caja', href: '#', stub: true },
    { section: 'tesoreria', label: 'Bancos', href: '#', stub: true },

    // Todavía sin pantallas: la ve quien ya veía el área financiera.
    ...['Contabilidad', 'Impuestos', 'Presupuesto'].map((label) => ({
      section: 'contabilidad',
      label,
      href: '#',
      stub: true,
      modules: ['billing', 'payments', 'finance', 'collections', 'procurement'],
      anyPermission: [
        'billing:read',
        'payments:read',
        'finance:read',
        'collections:read',
        'procurement:payables:read',
      ],
    })),

    { section: 'empresa', label: 'Mi empresa', href: '/dashboard/settings/tenant' },
    { section: 'empresa', label: 'Sucursales', href: '/dashboard/settings/branches' },
    { section: 'empresa', label: 'Precios', href: '/dashboard/settings/pricing' },
    { section: 'empresa', label: 'Depósitos', href: '/dashboard/settings/warehouses' },

    ...['Planes', 'Addons', 'Transacciones'].map((label) => ({
      section: 'membership',
      label,
      href: '#',
      stub: true,
    })),
    ...[
      'Contacto de mensajes',
      'Tickets',
      'Base de conocimiento',
      'Gestión de SLA',
    ].map((label) => ({ section: 'support', label, href: '#', stub: true })),

    { section: 'sistema', label: 'Módulos', href: '/dashboard/settings/modules' },
    { section: 'sistema', label: 'Gestión de usuarios', href: '/dashboard/settings/users' },
    { section: 'sistema', label: 'Roles y permisos', href: '/dashboard/settings/roles' },
    { section: 'sistema', label: 'Auditoría', href: '/dashboard/settings/audit' },
    { section: 'sistema', label: 'Alertas', href: '/dashboard/settings/alerts' },
    {
      section: 'sistema',
      label: 'Integraciones',
      href: '/dashboard/settings?tab=integrations',
      anyPermission: ['integrations:read'],
    },
    {
      section: 'sistema',
      label: 'Configuración',
      href: '/dashboard/settings',
      anyPermission: ['tenants:update'],
    },
  ],
  routes: [
    { prefix: COMMUNICATIONS_PATH, anyPermission: ['communications:access'] },
    {
      prefix: '/dashboard/applications/communications',
      anyPermission: ['communications:access'],
    },
    {
      prefix: '/dashboard/applications/email',
      anyPermission: ['communications:access'],
    },
    // La raíz de Ajustes y el perfil quedan libres: ahí están el perfil y el
    // cambio de contraseña de cualquier usuario.
    { prefix: '/dashboard/settings/tenant', anyPermission: ['tenants:read'] },
    { prefix: '/dashboard/settings/branches', anyPermission: ['branches:read'] },
    { prefix: '/dashboard/settings/pricing', anyPermission: ['tenants:update'] },
    { prefix: '/dashboard/settings/credit', anyPermission: ['tenants:update'] },
    { prefix: '/dashboard/settings/warehouses', anyPermission: ['warehouses:read'] },
    {
      prefix: '/dashboard/settings/modules',
      anyPermission: ['tenants:modules:manage'],
    },
    { prefix: '/dashboard/settings/users', anyPermission: ['users:read'] },
    { prefix: '/dashboard/settings/roles', anyPermission: ['roles:manage'] },
    { prefix: '/dashboard/settings/audit', anyPermission: ['audit:read'] },
    { prefix: '/dashboard/settings/alerts', anyPermission: ['alerts:manage'] },
  ],
};
