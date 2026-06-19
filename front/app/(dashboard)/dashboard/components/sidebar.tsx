'use client';

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
  LogOut,
  Lock,
  UserCog,
} from 'lucide-react';
import { useAuth } from '../../../../lib/auth-context';

// Permissions that grant access to each business module.
// If the user has at least one, the module link is shown.
const MODULE_PERM_MAP: Record<string, string[]> = {
  sales: ['sales:read', 'sales:create', 'sales:update', 'sales:cancel', 'customers:read', 'customers:create', 'customers:update'],
  inventory: ['inventory:read', 'inventory:create', 'inventory:update', 'inventory:delete'],
  billing: ['billing:read', 'billing:issue', 'billing:cancel'],
  procurement: ['procurement:read', 'procurement:create', 'procurement:update', 'procurement:receive', 'suppliers:read', 'suppliers:create', 'suppliers:update'],
  payments: [],
  hr: [],
};

function hasModulePermission(module: string, permissions: string[]): boolean {
  // Admin-level users (with roles:manage) see everything
  if (permissions.includes('roles:manage')) return true;
  const relevant = MODULE_PERM_MAP[module] ?? [];
  if (relevant.length === 0) return false;
  return relevant.some((p) => permissions.includes(p));
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  module?: string;
  requiredPermission?: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Ventas', href: '/dashboard/sales', icon: ShoppingCart, module: 'sales' },
  { label: 'Inventario', href: '/dashboard/inventory', icon: Package, module: 'inventory' },
  { label: 'Facturación', href: '/dashboard/billing', icon: FileText, module: 'billing' },
  { label: 'Compras', href: '/dashboard/procurement', icon: Truck, module: 'procurement' },
  { label: 'Pagos', href: '/dashboard/payments', icon: CreditCard, module: 'payments' },
  { label: 'RRHH', href: '/dashboard/hr', icon: Users, module: 'hr' },
];

const SETTINGS_ITEMS: NavItem[] = [
  { label: 'Mi perfil', href: '/dashboard/settings/profile', icon: UserCog },
  { label: 'Usuarios', href: '/dashboard/settings/users', icon: User, requiredPermission: 'users:read' },
  { label: 'Roles', href: '/dashboard/settings/roles', icon: Shield, requiredPermission: 'roles:manage' },
  { label: 'Mi empresa', href: '/dashboard/settings/tenant', icon: Building2, requiredPermission: 'tenants:read' },
  { label: 'Módulos', href: '/dashboard/settings/modules', icon: LayoutGrid, requiredPermission: 'tenants:modules:manage' },
];

function NavLink({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const isActive =
    item.href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(item.href);
  const Icon = item.icon;
  const base = 'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors select-none';

  return (
    <Link
      href={item.href}
      className={`${base} ${
        isActive ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
      }`}
    >
      <Icon size={16} />
      <span className="flex-1">{item.label}</span>
    </Link>
  );
}

function LockedModuleItem({ item }: { item: NavItem }) {
  const Icon = item.icon;
  return (
    <span className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-500 opacity-60 cursor-not-allowed select-none">
      <Icon size={16} />
      <span className="flex-1">{item.label}</span>
      <Lock size={12} className="text-slate-500" />
    </span>
  );
}

export function Sidebar() {
  const { user, jwtPayload, logout } = useAuth();
  const activeModules = jwtPayload?.activeModules ?? [];
  const permissions = jwtPayload?.permissions ?? [];

  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if (!item.module) return true; // Dashboard always shown
    // Module not active for tenant → show as locked (tenant-level feature)
    if (!activeModules.includes(item.module)) return true;
    // Module active but user has no relevant permissions → hide
    return hasModulePermission(item.module, permissions);
  });

  const visibleSettingsItems = SETTINGS_ITEMS.filter((item) => {
    if (!item.requiredPermission) return true; // "Mi perfil" always shown
    return permissions.includes(item.requiredPermission);
  });

  return (
    <aside className="fixed inset-y-0 left-0 flex w-64 flex-col bg-slate-900">
      {/* Brand + company name */}
      <div className="flex h-16 items-center gap-3 border-b border-slate-800 px-4">
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

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {visibleNavItems.map((item) => {
          if (item.module && !activeModules.includes(item.module)) {
            return <LockedModuleItem key={item.href} item={item} />;
          }
          return <NavLink key={item.href} item={item} />;
        })}

        {visibleSettingsItems.length > 0 && (
          <div className="pt-4">
            <p className="px-3 pb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
              Configuración
            </p>
            {visibleSettingsItems.map((item) => (
              <NavLink key={item.href} item={item} />
            ))}
          </div>
        )}
      </nav>

      <div className="border-t border-slate-800 p-3">
        <div className="flex items-center gap-3 rounded-lg px-3 py-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs font-medium text-white">
            {user?.firstName?.[0]}
            {user?.lastName?.[0]}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">
              {user?.firstName} {user?.lastName}
            </p>
            <p className="truncate text-xs text-slate-400">{user?.email}</p>
          </div>
          <button
            onClick={() => void logout()}
            className="rounded-md p-1 text-slate-400 transition hover:bg-slate-800 hover:text-white"
            title="Cerrar sesión"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
