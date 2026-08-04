'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  FileText,
  Truck,
  CreditCard,
  Users,
  User,
  Shield,
  Building2,
  LayoutGrid,
  Warehouse,
  ChevronDown,
  Bell,
  Wrench,
  ClipboardList,
  Tag,
  Percent,
  CheckSquare,
  Target,
  Landmark,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../../../lib/auth-context';
import { alertsApi } from '../../../../lib/api/alerts';

// ── Types ─────────────────────────────────────────────────────────────────────

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  module?: string;
  alertDot?: string; // hex color — shown as a small dot when an alert is active for this module
}

interface SettingsItem {
  label: string;
  href: string;
  icon: React.ElementType;
  requiredPermission?: string;
  badge?: number;
}

interface SettingsSection {
  label: string;
  items: SettingsItem[];
  requiredAnyPermission?: string[];
}

// ── Permission helpers ─────────────────────────────────────────────────────────

const MODULE_PERM_MAP: Record<string, string[]> = {
  sales:       ['sales:read', 'sales:create', 'sales:update', 'sales:cancel', 'customers:read', 'customers:create', 'customers:update'],
  inventory:   ['inventory:read', 'inventory:create', 'inventory:update', 'inventory:delete'],
  billing:     ['billing:read', 'billing:issue', 'billing:cancel', 'billing:manage'],
  procurement: ['procurement:read', 'procurement:create', 'procurement:update', 'procurement:receive', 'suppliers:read', 'suppliers:create', 'suppliers:update'],
  payments:    ['payments:read', 'payments:register'],
  finance:     ['finance:read', 'finance:manage'],
  hr:          ['hr:read', 'hr:employees:create', 'hr:employees:update', 'hr:employees:terminate', 'hr:payroll:run', 'hr:payroll:pay', 'hr:config:manage'],
};

function hasModulePermission(module: string, permissions: string[]): boolean {
  if (permissions.includes('roles:manage')) return true;
  const relevant = MODULE_PERM_MAP[module] ?? [];
  return relevant.length > 0 && relevant.some((p) => permissions.includes(p));
}

// ── Nav definitions ────────────────────────────────────────────────────────────

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard',   href: '/dashboard',             icon: LayoutDashboard },
  { label: 'Ventas',      href: '/dashboard/sales',       icon: ShoppingCart, module: 'sales' },
  { label: 'Inventario',  href: '/dashboard/inventory',   icon: Package,      module: 'inventory' },
  { label: 'Facturación', href: '/dashboard/billing',     icon: FileText,     module: 'billing' },
  { label: 'Compras',     href: '/dashboard/procurement', icon: Truck,        module: 'procurement' },
  { label: 'Cuentas',     href: '/dashboard/payments',    icon: CreditCard,   module: 'payments' },
  { label: 'Financiación',href: '/dashboard/finance',     icon: Landmark,     module: 'finance' },
  { label: 'RRHH',        href: '/dashboard/hr',          icon: Users,        module: 'hr' },
];

// Maps each alert type to the nav item it should annotate
const ALERT_DOT_MAP: Record<string, { href: string; color: string }> = {
  STOCK_LOW:       { href: '/dashboard/inventory', color: '#fbbf24' },
  PAYMENT_DUE:     { href: '/dashboard/payments',  color: '#60a5fa' },
  INVOICE_OVERDUE: { href: '/dashboard/billing',   color: '#f87171' },
};

const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    label: 'VENTAS',
    requiredAnyPermission: ['sales:read', 'customers:read'],
    items: [
      { label: 'Clientes', href: '/dashboard/sales/customers', icon: Users,  requiredPermission: 'customers:read' },
      { label: 'Metas',    href: '/dashboard/sales/targets',   icon: Target, requiredPermission: 'sales:read' },
    ],
  },
  {
    label: 'FACTURACIÓN',
    requiredAnyPermission: ['sales:manage'],
    items: [
      { label: 'Aprobaciones de crédito', href: '/dashboard/billing/approvals', icon: CheckSquare, requiredPermission: 'sales:manage' },
    ],
  },
  {
    label: 'USUARIOS',
    requiredAnyPermission: ['users:read', 'roles:manage'],
    items: [
      { label: 'Gestión de usuarios', href: '/dashboard/settings/users', icon: User,   requiredPermission: 'users:read' },
      { label: 'Roles y permisos',    href: '/dashboard/settings/roles', icon: Shield, requiredPermission: 'roles:manage' },
    ],
  },
  {
    label: 'CONFIGURACIÓN',
    requiredAnyPermission: ['tenants:read', 'tenants:update', 'tenants:modules:manage', 'roles:manage', 'alerts:manage', 'branches:read', 'warehouses:read'],
    items: [
      { label: 'Mi empresa',  href: '/dashboard/settings/tenant',     icon: Building2,  requiredPermission: 'tenants:read' },
      { label: 'Sucursales',  href: '/dashboard/settings/branches',   icon: LayoutGrid, requiredPermission: 'branches:read' },
      { label: 'Depósitos',   href: '/dashboard/settings/warehouses', icon: Warehouse,  requiredPermission: 'warehouses:read' },
      { label: 'Módulos',     href: '/dashboard/settings/modules',    icon: LayoutGrid, requiredPermission: 'tenants:modules:manage' },
      { label: 'Precios',     href: '/dashboard/settings/pricing',  icon: Tag,        requiredPermission: 'tenants:update' },
      { label: 'Crédito',     href: '/dashboard/settings/credit',   icon: Percent,    requiredPermission: 'tenants:update' },
      { label: 'Alertas',     href: '/dashboard/settings/alerts',   icon: Bell,       requiredPermission: 'alerts:manage' },
    ],
  },
  {
    label: 'HERRAMIENTAS',
    requiredAnyPermission: ['audit:read', 'reports:read'],
    items: [
      { label: 'Auditoría', href: '/dashboard/settings/audit',   icon: ClipboardList, requiredPermission: 'audit:read' },
      { label: 'Reportes',  href: '/dashboard/settings/reports', icon: Wrench,        requiredPermission: 'reports:read' },
    ],
  },
];

// ── NavLink ────────────────────────────────────────────────────────────────────

function NavLink({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const isActive = item.href === '/dashboard'
    ? pathname === '/dashboard'
    : pathname.startsWith(item.href);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '9px',
        padding: '8px 11px',
        borderRadius: '9px',
        textDecoration: 'none',
        fontSize: '13.5px',
        fontWeight: 500,
        transition: 'background 0.12s',
        color: isActive ? 'var(--sidebar-active-text)' : 'var(--sidebar-text)',
        background: isActive ? 'var(--sidebar-active)' : 'transparent',
      }}
      onMouseEnter={(e) => {
        if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)';
      }}
      onMouseLeave={(e) => {
        if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent';
      }}
    >
      <Icon size={16} style={{ opacity: 0.9, flexShrink: 0 }} />
      <span style={{ flex: 1 }}>{item.label}</span>
      {item.alertDot && (
        <span style={{
          width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0,
          background: item.alertDot,
          boxShadow: `0 0 5px ${item.alertDot}88`,
        }} />
      )}
    </Link>
  );
}

// ── SettingsLink ──────────────────────────────────────────────────────────────

function SettingsLink({ item }: { item: SettingsItem }) {
  const pathname = usePathname();
  const isActive = pathname.startsWith(item.href);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      style={{
        display: 'flex', alignItems: 'center', gap: '9px',
        padding: '7px 11px', borderRadius: '9px',
        textDecoration: 'none', fontSize: '13px', fontWeight: 500,
        transition: 'background 0.12s',
        color: isActive ? 'var(--sidebar-active-text)' : 'var(--sidebar-text)',
        background: isActive ? 'var(--sidebar-active)' : 'transparent',
      }}
      onMouseEnter={(e) => {
        if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)';
      }}
      onMouseLeave={(e) => {
        if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent';
      }}
    >
      <Icon size={15} style={{ opacity: 0.85, flexShrink: 0 }} />
      <span style={{ flex: 1 }}>{item.label}</span>
      {!!item.badge && (
        <span style={{
          fontSize: '11px', fontWeight: 700, lineHeight: 1,
          padding: '2px 6px', borderRadius: '20px',
          background: 'rgba(220,38,38,0.2)', color: '#f87171',
        }}>
          {item.badge}
        </span>
      )}
    </Link>
  );
}

// ── SettingsSection (collapsible) ─────────────────────────────────────────────

function SettingsSection({
  section,
  permissions,
}: {
  section: SettingsSection;
  permissions: string[];
}) {
  const pathname = usePathname();

  const visibleItems = section.items.filter(
    (item) => !item.requiredPermission || permissions.includes(item.requiredPermission),
  );

  const hasActive = visibleItems.some((item) => pathname.startsWith(item.href));
  const [open, setOpen] = useState(hasActive);

  if (visibleItems.length === 0) return null;

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          width: '100%', padding: '16px 11px 6px',
          border: 'none', background: 'none', cursor: 'pointer',
        }}
      >
        <span style={{
          fontSize: '10.5px', fontWeight: 700,
          letterSpacing: '0.09em', color: 'var(--sidebar-muted)',
        }}>
          {section.label}
        </span>
        <ChevronDown
          size={11}
          style={{
            color: 'var(--sidebar-muted)',
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.18s',
            flexShrink: 0,
          }}
        />
      </button>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
          {visibleItems.map((item) => (
            <SettingsLink key={item.href} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Sidebar ────────────────────────────────────────────────────────────────────

export function Sidebar() {
  const { jwtPayload } = useAuth();

  const activeModules = jwtPayload?.activeModules ?? [];
  const permissions   = jwtPayload?.permissions   ?? [];
  const tenantName    = jwtPayload?.tenantName ?? '';

  const { data: alertConfigs = [] } = useQuery({
    queryKey: ['alert-configs'],
    queryFn: alertsApi.getConfigs,
    enabled: permissions.includes('alerts:read') || permissions.includes('alerts:manage'),
  });
  const alertBadge = alertConfigs.filter((c) => c.isActive).length || undefined;

  const brandInitial = (tenantName?.[0] ?? 'J').toUpperCase();

  // Build a map href → dot color from active alert configs
  const alertDotMap = new Map<string, string>();
  for (const cfg of alertConfigs.filter((c) => c.isActive)) {
    const mapping = ALERT_DOT_MAP[cfg.type];
    if (mapping) alertDotMap.set(mapping.href, mapping.color);
  }

  const visibleNavItems = NAV_ITEMS
    .filter((item) => {
      if (!item.module) return true;
      if (!activeModules.includes(item.module)) return false;
      return hasModulePermission(item.module, permissions);
    })
    .map((item) => ({
      ...item,
      alertDot: alertDotMap.get(item.href),
    }));

  const visibleSections = SETTINGS_SECTIONS
    .filter((section) => {
      if (!section.requiredAnyPermission) return true;
      return section.requiredAnyPermission.some((p) => permissions.includes(p));
    })
    .map((section) => ({
      ...section,
      items: section.items.map((item) =>
        item.href === '/dashboard/settings/alerts'
          ? { ...item, badge: alertBadge }
          : item,
      ),
    }));

  return (
    <aside style={{
      position: 'fixed', inset: '0 auto 0 0',
      width: '250px',
      display: 'flex', flexDirection: 'column',
      background: 'var(--sidebar-bg)',
      color: 'var(--sidebar-text)',
      borderRight: '1px solid var(--sidebar-border)',
    }}>
      {/* Brand */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '11px',
        padding: '18px 18px 16px',
      }}>
        <div style={{
          width: '38px', height: '38px', borderRadius: '10px', flexShrink: 0,
          background: 'linear-gradient(145deg, var(--accent), var(--accent-strong))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontWeight: 800, fontSize: '18px',
          boxShadow: '0 4px 12px rgba(16,185,129,0.35)',
        }}>
          {brandInitial}
        </div>
        <div style={{ lineHeight: 1.15, minWidth: 0 }}>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: '15px' }}>JoapyCore</div>
          {tenantName && (
            <div style={{ fontSize: '12px', color: 'var(--sidebar-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {tenantName}
            </div>
          )}
        </div>
      </div>

      {/* Scrollable nav */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: '6px 12px 12px' }}>
        {/* Main nav */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
          {visibleNavItems.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}
        </div>

        {/* Settings sections */}
        {visibleSections.map((section) => (
          <SettingsSection
            key={section.label}
            section={section}
            permissions={permissions}
          />
        ))}
      </nav>

    </aside>
  );
}
