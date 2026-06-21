'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
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
  LogOut,
  ChevronDown,
  Bell,
  Wrench,
  ClipboardList,
  UserCog,
} from 'lucide-react';
import { useAuth } from '../../../../lib/auth-context';

// ── Types ─────────────────────────────────────────────────────────────────────

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  module?: string;
}

interface SettingsItem {
  label: string;
  href: string;
  icon: React.ElementType;
  requiredPermission?: string;
}

interface SettingsSection {
  label: string;
  items: SettingsItem[];
  /** At least one of these permissions is required to show the section */
  requiredAnyPermission?: string[];
}

// ── Permission helpers ─────────────────────────────────────────────────────────

const MODULE_PERM_MAP: Record<string, string[]> = {
  sales:       ['sales:read', 'sales:create', 'sales:update', 'sales:cancel', 'customers:read', 'customers:create', 'customers:update'],
  inventory:   ['inventory:read', 'inventory:create', 'inventory:update', 'inventory:delete'],
  billing:     ['billing:read', 'billing:issue', 'billing:cancel'],
  procurement: ['procurement:read', 'procurement:create', 'procurement:update', 'procurement:receive', 'suppliers:read', 'suppliers:create', 'suppliers:update'],
  payments:    ['payments:read', 'payments:register'],
  hr:          ['hr:read', 'hr:employees:create', 'hr:employees:update', 'hr:employees:terminate', 'hr:payroll:run', 'hr:payroll:pay', 'hr:config:manage'],
};

function isAdmin(permissions: string[]) {
  return permissions.includes('roles:manage');
}

function hasModulePermission(module: string, permissions: string[]): boolean {
  if (isAdmin(permissions)) return true;
  const relevant = MODULE_PERM_MAP[module] ?? [];
  return relevant.length > 0 && relevant.some((p) => permissions.includes(p));
}

// ── Nav items (business modules) ──────────────────────────────────────────────

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard',   href: '/dashboard',             icon: LayoutDashboard },
  { label: 'Ventas',      href: '/dashboard/sales',       icon: ShoppingCart, module: 'sales' },
  { label: 'Inventario',  href: '/dashboard/inventory',   icon: Package,      module: 'inventory' },
  { label: 'Facturación', href: '/dashboard/billing',     icon: FileText,     module: 'billing' },
  { label: 'Compras',     href: '/dashboard/procurement', icon: Truck,        module: 'procurement' },
  { label: 'Pagos',       href: '/dashboard/payments',    icon: CreditCard,   module: 'payments' },
  { label: 'RRHH',        href: '/dashboard/hr',          icon: Users,        module: 'hr' },
];

// ── Settings sections (collapsible) ───────────────────────────────────────────

const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    label: 'Usuarios',
    requiredAnyPermission: ['users:read', 'roles:manage'],
    items: [
      { label: 'Gestión de usuarios', href: '/dashboard/settings/users',  icon: User,   requiredPermission: 'users:read' },
      { label: 'Roles y permisos',    href: '/dashboard/settings/roles',  icon: Shield, requiredPermission: 'roles:manage' },
    ],
  },
  {
    label: 'Configuración',
    requiredAnyPermission: ['tenants:read', 'tenants:update', 'tenants:modules:manage', 'roles:manage'],
    items: [
      { label: 'Mi empresa',  href: '/dashboard/settings/tenant',    icon: Building2,  requiredPermission: 'tenants:read' },
      { label: 'Sucursales',  href: '/dashboard/settings/branches',  icon: LayoutGrid, requiredPermission: 'branches:read' },
      { label: 'Módulos',     href: '/dashboard/settings/modules',   icon: LayoutGrid, requiredPermission: 'tenants:modules:manage' },
      { label: 'Alertas',     href: '/dashboard/settings/alerts',    icon: Bell,       requiredPermission: 'roles:manage' },
    ],
  },
  {
    label: 'Herramientas',
    requiredAnyPermission: ['roles:manage'],
    items: [
      { label: 'Auditoría', href: '/dashboard/settings/audit',   icon: ClipboardList, requiredPermission: 'roles:manage' },
      { label: 'Reportes',  href: '/dashboard/settings/reports', icon: Wrench,        requiredPermission: 'roles:manage' },
    ],
  },
];

// ── Sub-components ─────────────────────────────────────────────────────────────

function NavLink({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const isActive = item.href === '/dashboard'
    ? pathname === '/dashboard'
    : pathname.startsWith(item.href);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors select-none ${
        isActive ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
      }`}
    >
      <Icon size={16} />
      <span className="flex-1">{item.label}</span>
    </Link>
  );
}


function SettingsLink({ item }: { item: SettingsItem }) {
  const pathname = usePathname();
  const isActive = pathname.startsWith(item.href);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors ${
        isActive ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
      }`}
    >
      <Icon size={14} />
      {item.label}
    </Link>
  );
}

function CollapsibleSection({
  section,
  permissions,
  defaultOpen,
}: {
  section: SettingsSection;
  permissions: string[];
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const visibleItems = section.items.filter(
    (item) => !item.requiredPermission || permissions.includes(item.requiredPermission),
  );

  if (visibleItems.length === 0) return null;

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-300 transition-colors"
      >
        {section.label}
        <ChevronDown
          size={13}
          className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="mt-1 space-y-0.5 pl-1">
          {visibleItems.map((item) => (
            <SettingsLink key={item.href} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function UserMenu({ onClose }: { onClose: () => void }) {
  const { logout } = useAuth();
  const router = useRouter();

  const handleProfile = () => {
    router.push('/dashboard/settings/profile');
    onClose();
  };

  const handleLogout = async () => {
    onClose();
    await logout();
  };

  return (
    <div className="absolute bottom-full left-3 right-3 mb-2 rounded-xl border border-slate-700 bg-slate-800 py-1 shadow-xl">
      <button
        onClick={handleProfile}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors rounded-md"
      >
        <UserCog size={15} />
        Mi perfil
      </button>
      <div className="my-1 border-t border-slate-700" />
      <button
        onClick={() => void handleLogout()}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-red-400 hover:bg-slate-700 hover:text-red-300 transition-colors rounded-md"
      >
        <LogOut size={15} />
        Cerrar sesión
      </button>
    </div>
  );
}

// ── Sidebar ────────────────────────────────────────────────────────────────────

export function Sidebar() {
  const { user, jwtPayload } = useAuth();
  const pathname = usePathname();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const activeModules = jwtPayload?.activeModules ?? [];
  const permissions   = jwtPayload?.permissions   ?? [];

  // Close user menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    if (userMenuOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [userMenuOpen]);

  // Auto-open the section that contains the active route
  function isSectionActive(section: SettingsSection) {
    return section.items.some((i) => pathname.startsWith(i.href));
  }

  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if (!item.module) return true;
    if (!activeModules.includes(item.module)) return false;
    return hasModulePermission(item.module, permissions);
  });

  const visibleSections = SETTINGS_SECTIONS.filter((section) => {
    if (!section.requiredAnyPermission) return true;
    return section.requiredAnyPermission.some((p) => permissions.includes(p));
  });

  return (
    <aside className="fixed inset-y-0 left-0 flex w-64 flex-col bg-slate-900">
      {/* Brand */}
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-slate-800 px-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white">
          <span className="text-slate-900 font-bold text-sm">J</span>
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">JoapyCore</p>
          {jwtPayload?.tenantName && (
            <p className="truncate text-xs text-slate-400">{jwtPayload.tenantName}</p>
          )}
        </div>
      </div>

      {/* Scrollable nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
        {/* Business modules */}
        {visibleNavItems.map((item) => (
          <NavLink key={item.href} item={item} />
        ))}

        {/* Settings sections */}
        {visibleSections.length > 0 && (
          <div className="pt-4 space-y-3">
            {visibleSections.map((section) => (
              <CollapsibleSection
                key={section.label}
                section={section}
                permissions={permissions}
                defaultOpen={isSectionActive(section)}
              />
            ))}
          </div>
        )}
      </nav>

      {/* User footer */}
      <div className="relative border-t border-slate-800 p-3" ref={userMenuRef}>
        {userMenuOpen && <UserMenu onClose={() => setUserMenuOpen(false)} />}

        <button
          onClick={() => setUserMenuOpen((v) => !v)}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-slate-800 transition-colors"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs font-semibold text-white">
            {user?.firstName?.[0]}
            {user?.lastName?.[0]}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">
              {user?.firstName} {user?.lastName}
            </p>
            <p className="truncate text-xs text-slate-400">{user?.email}</p>
          </div>
          <ChevronDown
            size={14}
            className={`shrink-0 text-slate-400 transition-transform duration-200 ${userMenuOpen ? 'rotate-180' : ''}`}
          />
        </button>
      </div>
    </aside>
  );
}
