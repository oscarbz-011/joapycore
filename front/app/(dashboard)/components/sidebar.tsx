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
} from 'lucide-react';
import { useAuth } from '../../../lib/auth-context';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  module?: string;
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
  { label: 'Usuarios', href: '/dashboard/settings/users', icon: User },
  { label: 'Roles', href: '/dashboard/settings/roles', icon: Shield },
  { label: 'Mi empresa', href: '/dashboard/settings/tenant', icon: Building2 },
  { label: 'Módulos', href: '/dashboard/settings/modules', icon: LayoutGrid },
];

function NavLink({ item, activeModules }: { item: NavItem; activeModules: string[] }) {
  const pathname = usePathname();
  const isActive =
    item.href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(item.href);
  const isLocked = item.module !== undefined && !activeModules.includes(item.module);
  const Icon = item.icon;

  const base =
    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors select-none';

  if (isLocked) {
    return (
      <span className={`${base} text-slate-500 cursor-not-allowed opacity-60`}>
        <Icon size={16} />
        <span className="flex-1">{item.label}</span>
        <Lock size={12} className="text-slate-400" />
      </span>
    );
  }

  return (
    <Link
      href={item.href}
      className={`${base} ${
        isActive
          ? 'bg-slate-800 text-white'
          : 'text-slate-300 hover:bg-slate-800 hover:text-white'
      }`}
    >
      <Icon size={16} />
      <span className="flex-1">{item.label}</span>
    </Link>
  );
}

export function Sidebar() {
  const { user, jwtPayload, logout } = useAuth();
  const activeModules = jwtPayload?.activeModules ?? [];

  return (
    <aside className="fixed inset-y-0 left-0 flex w-64 flex-col bg-slate-900">
      <div className="flex h-16 items-center gap-3 border-b border-slate-800 px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white">
          <span className="text-slate-900 font-bold text-sm">J</span>
        </div>
        <span className="font-semibold text-white text-sm">JoapyCore</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.href} item={item} activeModules={activeModules} />
        ))}

        <div className="pt-4">
          <p className="px-3 pb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
            Configuración
          </p>
          {SETTINGS_ITEMS.map((item) => (
            <NavLink key={item.href} item={item} activeModules={activeModules} />
          ))}
        </div>
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
