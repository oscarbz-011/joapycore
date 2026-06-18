'use client';

import {
  ShoppingCart,
  Package,
  FileText,
  Truck,
  CreditCard,
  Users,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { useAuth } from '../../../lib/auth-context';

const ALL_MODULES = [
  { key: 'sales', label: 'Ventas', icon: ShoppingCart },
  { key: 'inventory', label: 'Inventario', icon: Package },
  { key: 'billing', label: 'Facturación', icon: FileText },
  { key: 'procurement', label: 'Compras', icon: Truck },
  { key: 'payments', label: 'Pagos', icon: CreditCard },
  { key: 'hr', label: 'RRHH', icon: Users },
];

export default function DashboardPage() {
  const { user, jwtPayload } = useAuth();
  const activeModules = jwtPayload?.activeModules ?? [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">
          Hola, {user?.firstName} 👋
        </h1>
        <p className="mt-1 text-slate-500 text-sm">
          Bienvenido a tu panel de JoapyCore.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { label: 'Órdenes hoy', value: '—', description: 'Próximamente' },
          { label: 'Facturación del mes', value: '—', description: 'Próximamente' },
          { label: 'Stock crítico', value: '—', description: 'Próximamente' },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-sm text-slate-500">{stat.label}</p>
            <p className="mt-1 text-3xl font-semibold text-slate-900">{stat.value}</p>
            <p className="mt-1 text-xs text-slate-400">{stat.description}</p>
          </div>
        ))}
      </div>

      <div>
        <h2 className="mb-4 text-base font-medium text-slate-900">Módulos activos</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {ALL_MODULES.map(({ key, label, icon: Icon }) => {
            const isActive = activeModules.includes(key);
            return (
              <div
                key={key}
                className={`flex items-center gap-3 rounded-xl border p-4 ${
                  isActive
                    ? 'border-slate-200 bg-white'
                    : 'border-slate-100 bg-slate-50 opacity-60'
                }`}
              >
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    isActive ? 'bg-slate-100' : 'bg-slate-200'
                  }`}
                >
                  <Icon size={18} className={isActive ? 'text-slate-700' : 'text-slate-400'} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900">{label}</p>
                </div>
                {isActive ? (
                  <CheckCircle2 size={16} className="shrink-0 text-emerald-500" />
                ) : (
                  <Lock size={14} className="shrink-0 text-slate-400" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
